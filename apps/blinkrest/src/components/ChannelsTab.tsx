import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Chip, Field, card, heading, rupees } from '@/components/inventory/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

type Row = { channel: string; orders: number; gross_minor: number; commission_pct: number; commission_minor: number; net_minor: number };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const LABEL: Record<string, string> = { direct: 'Direct (dine-in, own takeaway)', zomato: 'Zomato', swiggy: 'Swiggy', other: 'Other marketplaces' };

// Earnings by sales channel, after each marketplace's commission.
export function ChannelsTab() {
  const { membership } = useAuth();
  const canEdit = !!membership?.permissions.has('settings.manage');
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [rows, setRows] = useState<Row[]>([]);
  const [z, setZ] = useState('0');
  const [s, setS] = useState('0');
  const [o, setO] = useState('0');

  const load = useCallback(async () => {
    if (!membership) return;
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days + 1);
    const [r, t] = await Promise.all([
      supabase.rpc('channel_report', { p_from: ymd(from), p_to: ymd(to) }),
      supabase.from('tenants').select('settings').eq('id', membership.tenantId).maybeSingle(),
    ]);
    setRows((r.data as Row[]) ?? []);
    const c = (t.data?.settings as { commissions?: Record<string, number> } | null)?.commissions;
    setZ(String(c?.zomato ?? 0));
    setS(String(c?.swiggy ?? 0));
    setO(String(c?.other ?? 0));
  }, [membership, days]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function save() {
    const { error } = await supabase.rpc('set_channel_commissions', { p_zomato: Number(z) || 0, p_swiggy: Number(s) || 0, p_other: Number(o) || 0 });
    if (error) Alert.alert('Could not save', error.message === 'invalid_settings' ? 'Commission must be between 0 and 60%.' : error.message);
    else {
      Alert.alert('Saved');
      load();
    }
  }

  const totalNet = rows.reduce((a, r) => a + r.net_minor, 0);

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {([7, 30, 90] as const).map((d) => <Chip key={d} label={`${d} days`} on={days === d} onPress={() => setDays(d)} />)}
      </View>
      <Text style={{ fontSize: 12, color: colors.ink500 }}>
        Commission is estimated as a percentage of the bill before GST. Check it against the marketplace&apos;s own payout statement, which also includes their fees and charges.
      </Text>
      {rows.map((r) => (
        <View key={r.channel} style={card}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{LABEL[r.channel] ?? r.channel}</Text>
            <Text style={{ fontSize: 16, fontFamily: fonts.display, color: colors.ink900 }}>{rupees(r.net_minor, 0)}</Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.ink700 }}>
            {r.orders} orders · billed {rupees(r.gross_minor, 0)}
            {r.commission_pct > 0 ? ` · commission ${r.commission_pct}% = ${rupees(r.commission_minor, 0)}` : ''}
          </Text>
        </View>
      ))}
      {rows.length > 0 ? <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Total kept after commission: {rupees(totalNet, 0)}</Text> : null}

      {canEdit ? (
        <View style={card}>
          <Text style={heading}>COMMISSION RATES (%)</Text>
          <Field label="Zomato" value={z} onChangeText={setZ} keyboardType="decimal-pad" />
          <Field label="Swiggy" value={s} onChangeText={setS} keyboardType="decimal-pad" />
          <Field label="Other marketplaces" value={o} onChangeText={setO} keyboardType="decimal-pad" />
          <Button label="Save rates" onPress={save} />
        </View>
      ) : null}
    </>
  );
}
