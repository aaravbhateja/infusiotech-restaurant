import { AiWriteButton } from '@/components/AiWriteButton';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedToggle } from '@/components/AnimatedToggle';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { MenuExtras } from '@/components/MenuExtras';
import { RequireAccess } from '@/components/RequireAccess';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { menuImageUrl, pickAndUploadMenuImage } from '@/lib/menuImage';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

type Category = { id: string; name: string };

function NewMenuItemScreen() {
  const { membership } = useAuth();
  const isOnline = useIsOnline();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [isVeg, setIsVeg] = useState(true);
  const [station, setStation] = useState('general');
  const [prepMinutes, setPrepMinutes] = useState('');
  const [allergens, setAllergens] = useState<string[]>([]);
  const [spice, setSpice] = useState<number | null>(null);
  const [nameHi, setNameHi] = useState('');
  const [descHi, setDescHi] = useState('');
  const [available, setAvailable] = useState(true);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!membership) return;
    supabase
      .from('menu_categories')
      .select('id, name')
      .eq('tenant_id', membership.tenantId)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        setCategories(data ?? []);
        if (data?.[0]) setCategoryId(data[0].id);
      });
  }, [membership]);

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

  async function save() {
    if (!membership || !categoryId) return;
    const priceNum = Math.round(parseFloat(price || '0') * 100);
    if (!name.trim() || priceNum <= 0) {
      setError('Enter a name and a price greater than ₹0.');
      return;
    }
    if (!guardOnline(isOnline)) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.from('menu_items').insert({
      tenant_id: membership.tenantId,
      category_id: categoryId,
      name: name.trim(),
      description: description.trim() || null,
      price_minor: priceNum,
      dietary_labels: [isVeg ? 'veg' : 'non-veg'],
      is_available: available,
      image_path: imagePath,
      station,
      prep_minutes: prepMinutes ? Number(prepMinutes) : null,
      allergens,
      spice_level: spice,
      name_hi: nameHi.trim() || null,
      description_hi: descHi.trim() || null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.back();
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12 }}>
        <Pressable
          onPress={() => router.back()}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
        </Pressable>
        <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Add item</Text>
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
          <TextField label="Item name" value={name} onChangeText={setName} placeholder="Paneer Tikka" autoCapitalize="words" />
          <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Short description" />
          <AiWriteButton
            name={name}
            category={categories.find((c) => c.id === categoryId)?.name}
            notes={description}
            onResult={(c) => {
              setDescription(c.description);
              setNameHi(c.name_hi);
              setDescHi(c.description_hi);
            }}
          />

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


          <MenuExtras allergens={allergens} setAllergens={setAllergens} spice={spice} setSpice={setSpice} nameHi={nameHi} setNameHi={setNameHi} descHi={descHi} setDescHi={setDescHi} />
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
          <TextField label="Price (₹)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0" error={error ?? undefined} />
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 15, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Available to order</Text>
            <Text style={{ fontSize: 12, color: colors.ink500 }}>Turn off to mark sold out instantly</Text>
          </View>
          <AnimatedToggle value={available} onValueChange={() => setAvailable((v) => !v)} onColor="#0E8F4A" />
        </View>

        <Button title={saving ? 'Saving...' : 'Save item'} onPress={save} loading={saving} disabled={!categoryId} />
      </ScrollView>
    </SafeAreaView>
  );
}

export default function NewMenuItem() {
  return (
    <RequireAccess permission="menu.create">
      <NewMenuItemScreen />
    </RequireAccess>
  );
}
