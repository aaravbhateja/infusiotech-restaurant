import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedToggle } from '@/components/AnimatedToggle';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { RecipeEditor } from '@/components/inventory/RecipeEditor';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { menuImageUrl, pickAndUploadMenuImage } from '@/lib/menuImage';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

type Category = { id: string; name: string };

function EditMenuItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { membership } = useAuth();
  const isOnline = useIsOnline();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [history, setHistory] = useState<{ id: string; changed_at: string; old_name: string | null; new_name: string | null; old_price_minor: number | null; new_price_minor: number | null }[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [reqPrice, setReqPrice] = useState('');
  const [reqReason, setReqReason] = useState('');
  const [reqBusy, setReqBusy] = useState(false);
  const [isVeg, setIsVeg] = useState(true);
  const [station, setStation] = useState('general');
  const [prepMinutes, setPrepMinutes] = useState('');
  const [available, setAvailable] = useState(true);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!membership) return;
    const [{ data: cats }, { data: item }] = await Promise.all([
      supabase.from('menu_categories').select('id, name').eq('tenant_id', membership.tenantId).eq('is_active', true).order('sort_order'),
      supabase
        .from('menu_items')
        .select('category_id, name, description, price_minor, dietary_labels, is_available, image_path, station, prep_minutes, base_price_minor')
        .eq('id', id)
        .eq('tenant_id', membership.tenantId)
        .single(),
    ]);
    setCategories(cats ?? []);
    if (item) {
      setCategoryId(item.category_id);
      setName(item.name);
      setDescription(item.description ?? '');
      // The permanent price (the live one may be a happy-hour price).
      setPrice(String(item.base_price_minor / 100));
      setIsVeg(item.dietary_labels?.includes('veg') ?? true);
      setStation(item.station ?? 'general');
      setPrepMinutes(item.prep_minutes ? String(item.prep_minutes) : '');
      setAvailable(item.is_available);
      setImagePath(item.image_path ?? null);
    }
    setLoading(false);
  }, [id, membership]);

  async function choosePhoto() {
    if (!membership) return;
    setUploadingImage(true);
    try {
      const path = await pickAndUploadMenuImage(membership.tenantId);
      if (path) setImagePath(path);
    } catch (e) {
      Alert.alert('Could not add photo', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setUploadingImage(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function createCategory() {
    if (!membership || !newCategoryName.trim()) return;
    const { data, error } = await supabase
      .from('menu_categories')
      .insert({ tenant_id: membership.tenantId, name: newCategoryName.trim() })
      .select('id, name')
      .single();
    if (error) {
      Alert.alert('Could not add category', error.message);
      return;
    }
    setCategories((prev) => [...prev, data]);
    setCategoryId(data.id);
    setNewCategoryName('');
    setAddingCategory(false);
  }

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('menu_item_history')
      .select('id, changed_at, old_name, new_name, old_price_minor, new_price_minor')
      .eq('menu_item_id', id)
      .order('changed_at', { ascending: false })
      .limit(6);
    setHistory(data ?? []);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    loadHistory();
  }, [loadHistory]);

  async function restoreVersion(historyId: string) {
    const { error: restoreError } = await supabase.rpc('restore_menu_item_version', { p_history_id: historyId });
    if (restoreError) {
      Alert.alert('Could not restore', restoreError.message === 'price_change_requires_approval' ? 'Restoring a price needs the price permission.' : restoreError.message);
      return;
    }
    Alert.alert('Restored', 'The earlier version is back.');
    router.replace(`/(staff)/menu/${id}` as never);
  }

  async function submitPriceRequest() {
    const minor = Math.round(parseFloat(reqPrice || '0') * 100);
    if (minor <= 0 || reqReason.trim().length === 0) {
      Alert.alert('Check the details', 'Enter the new price and a reason.');
      return;
    }
    setReqBusy(true);
    const { data, error: reqError } = await supabase.rpc('request_price_change', { p_item_id: id, p_new_price_minor: minor, p_reason: reqReason.trim() });
    setReqBusy(false);
    if (reqError) {
      Alert.alert('Could not send request', reqError.message);
      return;
    }
    setRequesting(false);
    setReqReason('');
    Alert.alert((data as { status?: string })?.status === 'pending_approval' ? 'Sent for approval' : 'Price changed', (data as { status?: string })?.status === 'pending_approval' ? 'The owner has to approve this price change.' : 'The new price is live.');
  }

  async function save() {
    if (!categoryId) return;
    const priceNum = Math.round(parseFloat(price || '0') * 100);
    if (!name.trim() || priceNum <= 0) {
      setError('Enter a name and a price greater than ₹0.');
      return;
    }
    if (!guardOnline(isOnline)) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from('menu_items')
      .update({
        category_id: categoryId,
        name: name.trim(),
        description: description.trim() || null,
        price_minor: priceNum,
        dietary_labels: [isVeg ? 'veg' : 'non-veg'],
        is_available: available,
        image_path: imagePath,
        station,
        prep_minutes: prepMinutes ? Number(prepMinutes) : null,
      })
      .eq('id', id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.back();
  }

  function confirmDelete() {
    Alert.alert('Delete item', 'This removes it from the menu permanently.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('menu_items').delete().eq('id', id);
          if (error) {
            Alert.alert('Could not delete item', error.message);
            return;
          }
          router.back();
        },
      },
    ]);
  }

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12 }}>
        <Pressable
          onPress={() => router.back()}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
        </Pressable>
        <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Edit item</Text>
        <Pressable
          onPress={confirmDelete}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#F4C7C1', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="trash" size={20} color={colors.error} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Pressable
          onPress={choosePhoto}
          disabled={uploadingImage}
          style={{
            height: 160,
            borderRadius: 22,
            borderWidth: 1.5,
            borderColor: imagePath ? 'transparent' : '#E4D8D0',
            borderStyle: imagePath ? 'solid' : 'dashed',
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {uploadingImage ? (
            <ActivityIndicator color={colors.coral600} />
          ) : imagePath ? (
            <>
              <Image source={{ uri: menuImageUrl(imagePath) ?? undefined }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              <View style={{ position: 'absolute', right: 10, bottom: 10, height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.6)', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="edit" size={15} color="#FFFFFF" />
                <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>Change</Text>
              </View>
            </>
          ) : (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Icon name="image" size={28} color={colors.ink500} />
              <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink700 }}>Add a dish photo</Text>
              <Text style={{ fontSize: 12, color: colors.ink500 }}>Shown on the customer menu</Text>
            </View>
          )}
        </Pressable>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 14 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Basics</Text>
          <TextField label="Item name" value={name} onChangeText={setName} autoCapitalize="words" />
          <TextField label="Description" value={description} onChangeText={setDescription} />

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {categories.map((c) => {
                const active = categoryId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setCategoryId(c.id)}
                    style={{
                      height: 40,
                      paddingHorizontal: 14,
                      borderRadius: radius.pill,
                      backgroundColor: active ? colors.ink900 : colors.surface,
                      borderWidth: active ? 0 : 1.5,
                      borderColor: colors.inputBorder,
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: active ? '#FFFFFF' : colors.ink900 }}>{c.name}</Text>
                  </Pressable>
                );
              })}
              {!addingCategory ? (
                <Pressable
                  onPress={() => setAddingCategory(true)}
                  style={{ height: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: '#E4A08F', backgroundColor: '#FFF8F5', flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <Icon name="plus" size={15} stroke={2.4} color={colors.coral700} />
                  <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.coral700 }}>New category</Text>
                </Pressable>
              ) : null}
            </View>
            {addingCategory ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  placeholder="e.g. Starters"
                  placeholderTextColor={colors.ink500}
                  style={{ flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 14, backgroundColor: colors.surface }}
                />
                <Button title="Add" onPress={createCategory} disabled={!newCategoryName.trim()} />
              </View>
            ) : null}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Food type</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                { v: true, label: 'Veg', c: '#0E8F4A' },
                { v: false, label: 'Non-veg', c: '#A0361C' },
              ].map((t) => {
                const active = isVeg === t.v;
                return (
                  <Pressable
                    key={t.label}
                    onPress={() => setIsVeg(t.v)}
                    style={{
                      flex: 1,
                      height: 48,
                      borderRadius: radius.md,
                      borderWidth: active ? 2 : 1.5,
                      borderColor: active ? t.c : colors.inputBorder,
                      backgroundColor: active ? `${t.c}14` : colors.surface,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <View style={{ width: 14, height: 14, borderWidth: 1.6, borderColor: t.c, borderRadius: 3, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.c }} />
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Kitchen station</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {['general', 'tandoor', 'curry', 'wok', 'grill', 'dessert', 'beverage'].map((s) => {
                const active = station === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setStation(s)}
                    style={{ height: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: active ? colors.ink900 : colors.surface, borderWidth: active ? 0 : 1.5, borderColor: colors.inputBorder, justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 13, fontFamily: active ? fonts.bodyExtraBold : fonts.bodyBold, color: active ? '#FFFFFF' : colors.ink900, textTransform: 'capitalize' }}>{s}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Prep time (minutes)</Text>
            <TextInput
              value={prepMinutes}
              onChangeText={(t) => setPrepMinutes(t.replace(/[^0-9]/g, '').slice(0, 3))}
              placeholder="Optional, e.g. 15"
              placeholderTextColor={colors.ink500}
              keyboardType="number-pad"
              style={{ height: 48, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 16, color: colors.ink900 }}
            />
            <Text style={{ fontSize: 12, color: colors.ink500 }}>The kitchen is alerted when an order takes longer than this.</Text>
          </View>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 14 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Price</Text>
          {membership?.permissions.has('menu.price.edit') ? (
            <TextField label="Price (₹)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" error={error ?? undefined} />
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>₹{price}</Text>
              <Text style={{ fontSize: 12, color: colors.ink500 }}>You cannot change prices directly. Ask for a change and the owner approves it.</Text>
              <Pressable onPress={() => { setReqPrice(price); setRequesting(true); }} style={{ alignSelf: 'flex-start', height: 40, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.inputBorder, justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900, fontSize: 13 }}>Request price change</Text>
              </Pressable>
            </View>
          )}
        </View>

        <RecipeEditor menuItemId={id} priceMinor={Math.round(parseFloat(price || '0') * 100)} />

        {history.length > 0 ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 10 }}>
            <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Version history</Text>
            {history.map((h) => (
              <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>
                    {h.old_price_minor !== h.new_price_minor ? `₹${(h.old_price_minor ?? 0) / 100} → ₹${(h.new_price_minor ?? 0) / 100}` : h.old_name !== h.new_name ? `${h.old_name} → ${h.new_name}` : 'Description edited'}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.ink500 }}>{new Date(h.changed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
                </View>
                {membership?.permissions.has('menu.edit') ? (
                  <Pressable onPress={() => restoreVersion(h.id)} style={{ height: 32, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.bg, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Undo</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <Modal visible={requesting} transparent animationType="fade" onRequestClose={() => setRequesting(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <View style={{ width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: 24, padding: 20, gap: 12 }}>
              <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Request price change</Text>
              <TextInput value={reqPrice} onChangeText={setReqPrice} keyboardType="decimal-pad" placeholder="New price (₹)" placeholderTextColor={colors.ink500} style={{ height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 14, color: colors.ink900 }} />
              <TextInput value={reqReason} onChangeText={setReqReason} placeholder="Reason" placeholderTextColor={colors.ink500} style={{ height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 14, color: colors.ink900 }} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => setRequesting(false)} style={{ flex: 1, height: 46, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Cancel</Text>
                </Pressable>
                <Pressable disabled={reqBusy} onPress={submitPriceRequest} style={{ flex: 1, height: 46, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center', opacity: reqBusy ? 0.6 : 1 }}>
                  <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>Send</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 15, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Available to order</Text>
            <Text style={{ fontSize: 12, color: colors.ink500 }}>Turn off to mark sold out instantly</Text>
          </View>
          <AnimatedToggle value={available} onValueChange={() => setAvailable((v) => !v)} onColor="#0E8F4A" />
        </View>

        <Button title={saving ? 'Saving...' : 'Save changes'} onPress={save} loading={saving} disabled={!categoryId} />
      </ScrollView>
    </SafeAreaView>
  );
}

export default function EditMenuItem() {
  return (
    <RequireAccess permission="menu.edit">
      <EditMenuItemScreen />
    </RequireAccess>
  );
}
