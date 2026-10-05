import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius } from '@/theme/tokens';

type Detail = {
  tenant: { id: string; name: string; slug: string; status: string; created_at: string; accepting_orders?: boolean };
  subscription: { status: string; plan_name: string; plan_key: string } | null;
  staff: { name: string | null; email: string; role: string; joined_at: string }[];
  counts: { tables: number; menu_items: number; orders_total: number; orders_last_30d: number; gmv_last_30d_minor: number };
  open_tickets: number;
};

export default function AdminTenantDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reasonOpen, setReasonOpen] = useState<'suspended' | 'active' | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('admin_get_tenant_detail', { p_tenant_id: id });
    setDetail(data ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function applyStatus() {
    if (!reasonOpen || !reason.trim()) return;
    setSaving(true);
    const { error } = await supabase.rpc('admin_set_tenant_status', { p_tenant_id: id, p_status: reasonOpen, p_reason: reason.trim() });
    setSaving(false);
    if (error) {
      Alert.alert('Could not update status', error.message);
      return;
    }
    setReasonOpen(null);
    setReason('');
    load();
  }

  if (loading || !detail) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <Text style={{ padding: 20, color: colors.ink500 }}>Loading…</Text>
      </SafeAreaView>
    );
  }

  const t = detail.tenant;
  const isActive = t.status === 'active';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={20} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>{t.name}</Text>
            <Text style={{ fontSize: 12, color: colors.ink500 }}>/{t.slug} · created {new Date(t.created_at).toLocaleDateString()}</Text>
          </View>
          <View style={{ height: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: isActive ? colors.successBg : colors.errorBg, justifyContent: 'center' }}>
            <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: isActive ? colors.success : colors.error, textTransform: 'uppercase' }}>{t.status}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {[
            ['Tables', String(detail.counts.tables)],
            ['Menu items', String(detail.counts.menu_items)],
            ['Orders (30d)', String(detail.counts.orders_last_30d)],
            ['Orders (all time)', String(detail.counts.orders_total)],
            ['GMV (30d)', formatMinor(detail.counts.gmv_last_30d_minor)],
            ['Open tickets', String(detail.open_tickets)],
          ].map(([label, value]) => (
            <View key={label} style={{ width: '31%', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: '#F4ECE6', padding: 12 }}>
              <Text style={{ fontSize: 17, fontFamily: fonts.display, color: colors.ink900 }}>{value}</Text>
              <Text style={{ fontSize: 11, color: colors.ink500, fontFamily: fonts.bodyBold }}>{label}</Text>
            </View>
          ))}
        </View>

        {detail.subscription ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name="crown" size={22} color={colors.saffron400} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{detail.subscription.plan_name} plan</Text>
              <Text style={{ fontSize: 12, color: colors.ink500, textTransform: 'capitalize' }}>{detail.subscription.status}</Text>
            </View>
          </View>
        ) : null}

        <View style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 10 }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.display, color: colors.ink900 }}>Team · {detail.staff.length}</Text>
          {detail.staff.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
              <View>
                <Text style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{s.name ?? s.email}</Text>
                <Text style={{ fontSize: 12, color: colors.ink500 }}>{s.email}</Text>
              </View>
              <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink700 }}>{s.role}</Text>
            </View>
          ))}
        </View>

        {reasonOpen ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 10 }}>
            <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>
              {reasonOpen === 'suspended' ? 'Reason for suspending' : 'Reason for reactivating'}
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Required — logged to the audit trail"
              multiline
              style={{ borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, padding: 12, fontSize: 15, minHeight: 70, textAlignVertical: 'top' }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setReasonOpen(null)} style={{ flex: 1, height: 48, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={applyStatus}
                disabled={!reason.trim() || saving}
                style={{ flex: 1, height: 48, borderRadius: radius.pill, backgroundColor: reasonOpen === 'suspended' ? colors.error : colors.success, alignItems: 'center', justifyContent: 'center', opacity: !reason.trim() || saving ? 0.6 : 1 }}
              >
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>{saving ? 'Saving…' : 'Confirm'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setReasonOpen(isActive ? 'suspended' : 'active')}
            style={{ height: 52, borderRadius: radius.pill, backgroundColor: isActive ? colors.errorBg : colors.successBg, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: isActive ? colors.error : colors.success }}>
              {isActive ? 'Suspend this restaurant' : 'Reactivate this restaurant'}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
