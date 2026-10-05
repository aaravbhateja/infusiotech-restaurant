import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

type Kind = 'percent' | 'flat' | 'free_item';
type Scope = 'all' | 'category' | 'item';

const KINDS: { key: Kind; sym: string; label: string }[] = [
  { key: 'percent', sym: '%', label: 'Percentage off' },
  { key: 'flat', sym: '₹', label: 'Flat amount off' },
  { key: 'free_item', sym: '+1', label: 'Free item' },
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SCOPES: { key: Scope; label: string }[] = [
  { key: 'all', label: 'Entire menu' },
  { key: 'category', label: 'Categories' },
];

function OfferCreateScreen() {
  const { membership } = useAuth();
  const isOnline = useIsOnline();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<Kind>('percent');
  const [value, setValue] = useState('10');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [minOrder, setMinOrder] = useState('499');
  const [scope, setScope] = useState<Scope>('all');
  const [selectedCats, setSelectedCats] = useState<Record<string, boolean>>({});
  const [days, setDays] = useState<Record<number, boolean>>({ 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true });
  const [usageLimit, setUsageLimit] = useState('500');
  const [perCustomer, setPerCustomer] = useState('1');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!membership) return;
    const { data } = await supabase.from('menu_categories').select('id, name').eq('tenant_id', membership.tenantId).eq('is_active', true).order('sort_order');
    setCategories(data ?? []);
  }, [membership]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function save() {
    if (!membership || !code.trim()) {
      Alert.alert('Add a promo code first');
      return;
    }
    if (!guardOnline(isOnline)) return;
    const selectedDays = Object.entries(days).filter(([, v]) => v).map(([k]) => Number(k));
    const payload = {
      code: code.trim(),
      kind,
      value_minor: kind === 'flat' ? Math.round(Number(value || 0) * 100) : null,
      value_percent: kind === 'percent' ? Number(value || 0) : null,
      max_discount_minor: maxDiscount ? Math.round(Number(maxDiscount) * 100) : null,
      min_order_minor: Math.round(Number(minOrder || 0) * 100),
      scope,
      category_ids: scope === 'category' ? Object.entries(selectedCats).filter(([, v]) => v).map(([k]) => k) : [],
      days_of_week: selectedDays,
      usage_limit: usageLimit ? Number(usageLimit) : null,
      per_customer_limit: Number(perCustomer || 1),
    };
    setSaving(true);
    const { error } = await supabase.rpc('create_offer', { p_tenant_id: membership.tenantId, p_offer: payload });
    setSaving(false);
    if (error) {
      Alert.alert('Could not create offer', error.message);
      return;
    }
    router.back();
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>Create offer</Text>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 12 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Offer type</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {KINDS.map((t) => {
              const on = t.key === kind;
              return (
                <Pressable key={t.key} onPress={() => setKind(t.key)} style={{ flex: 1, minHeight: 92, borderRadius: 18, borderWidth: on ? 2 : 1.5, borderColor: on ? colors.ink900 : '#E4D8D0', backgroundColor: on ? colors.coral50 : '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8 }}>
                  <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.coral700 }}>{t.sym}</Text>
                  <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink900, textAlign: 'center' }}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 14 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Code & value</Text>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Promo code</Text>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              autoCapitalize="characters"
              placeholder="DIWALI15"
              placeholderTextColor={colors.ink500}
              style={{ height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: '#E4D8D0', paddingHorizontal: 16, fontSize: 17, fontFamily: fonts.bodyExtraBold, letterSpacing: 1, color: colors.ink900, backgroundColor: '#FFFFFF' }}
            />
          </View>
          {kind !== 'free_item' ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{kind === 'percent' ? 'Discount (%)' : 'Discount (₹)'}</Text>
                <TextInput value={value} onChangeText={setValue} keyboardType="numeric" style={{ height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: '#E4D8D0', paddingHorizontal: 14, fontSize: 16, color: colors.ink900, backgroundColor: '#FFFFFF' }} />
              </View>
              {kind === 'percent' ? (
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Max discount (₹)</Text>
                  <TextInput value={maxDiscount} onChangeText={setMaxDiscount} keyboardType="numeric" placeholder="No cap" placeholderTextColor={colors.ink500} style={{ height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: '#E4D8D0', paddingHorizontal: 14, fontSize: 16, color: colors.ink900, backgroundColor: '#FFFFFF' }} />
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Minimum order value (₹)</Text>
            <TextInput value={minOrder} onChangeText={setMinOrder} keyboardType="numeric" style={{ height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: '#E4D8D0', paddingHorizontal: 14, fontSize: 16, color: colors.ink900, backgroundColor: '#FFFFFF' }} />
          </View>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 14 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Active days</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {DAY_LABELS.map((d, i) => {
              const on = !!days[i];
              return (
                <Pressable key={i} onPress={() => setDays((prev) => ({ ...prev, [i]: !on }))} style={{ flex: 1, height: 44, borderRadius: 14, borderWidth: on ? 0 : 1.5, borderColor: '#E4D8D0', backgroundColor: on ? colors.ink900 : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: on ? '#FFFFFF' : colors.ink700 }}>{d[0]}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 12 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Applies to</Text>
          <View style={{ flexDirection: 'row', backgroundColor: '#F7F1EC', borderRadius: radius.pill, padding: 4 }}>
            {SCOPES.map((s) => {
              const on = s.key === scope;
              return (
                <Pressable key={s.key} onPress={() => setScope(s.key)} style={{ flex: 1, height: 40, borderRadius: radius.pill, backgroundColor: on ? '#FFFFFF' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: colors.ink900 }}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {scope === 'category' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {categories.map((c) => {
                const on = !!selectedCats[c.id];
                return (
                  <Pressable key={c.id} onPress={() => setSelectedCats((prev) => ({ ...prev, [c.id]: !on }))} style={{ height: 38, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: on ? 0 : 1.5, borderColor: '#E4D8D0', backgroundColor: on ? colors.ink900 : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: on ? '#FFFFFF' : colors.ink900 }}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Total uses</Text>
              <TextInput value={usageLimit} onChangeText={setUsageLimit} keyboardType="numeric" style={{ height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: '#E4D8D0', paddingHorizontal: 14, fontSize: 16, color: colors.ink900, backgroundColor: '#FFFFFF' }} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Per customer</Text>
              <TextInput value={perCustomer} onChangeText={setPerCustomer} keyboardType="numeric" style={{ height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: '#E4D8D0', paddingHorizontal: 14, fontSize: 16, color: colors.ink900, backgroundColor: '#FFFFFF' }} />
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, padding: 16, paddingBottom: 28 }}>
        <Pressable disabled={saving} onPress={save} style={{ height: 56, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF', fontSize: 16 }}>{saving ? 'Creating…' : 'Create offer'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function OfferCreate() {
  return (
    <RequireAccess permission="offers.manage">
      <OfferCreateScreen />
    </RequireAccess>
  );
}
