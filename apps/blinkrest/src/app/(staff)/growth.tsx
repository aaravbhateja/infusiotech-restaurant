import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, Chip, Field, card, heading, rupees } from '@/components/inventory/ui';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

const TABS = [
  ['segments', 'Who to message'],
  ['loyalty', 'Loyalty'],
  ['results', 'Results'],
] as const;

type Seg = { customer_id: string; name: string | null; phone: string; consent: boolean; visits: number; spend_minor: number; last_order: string | null; days_since: number | null; points: number; birthday: string | null; segment: string };
type Result = { campaign: string; sent: number; returned: number; revenue_minor: number; first_sent: string };

const DEFAULT_MESSAGE: Record<string, string> = {
  'Win-back': 'Hi {name}, we miss you at {restaurant}! Come back this week and enjoy something special on us. Show this message at the counter.',
  'Birthday this week': 'Happy birthday {name}! Celebrate with us at {restaurant}. Show this message for a treat on your special day.',
  'Big spender': 'Hi {name}, thank you for being one of our best guests at {restaurant}. We have something special for you on your next visit.',
  New: 'Hi {name}, thank you for visiting {restaurant}! We would love to see you again soon.',
};

function GrowthScreen() {
  const { membership } = useAuth();
  const canSettings = !!membership?.permissions.has('settings.manage');
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('segments');
  const [segs, setSegs] = useState<Seg[]>([]);
  const [segment, setSegment] = useState('Win-back');
  const [message, setMessage] = useState(DEFAULT_MESSAGE['Win-back']);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Result[]>([]);

  const [enabled, setEnabled] = useState(false);
  const [earn, setEarn] = useState('1');
  const [value, setValue] = useState('1');

  const load = useCallback(async () => {
    if (!membership) return;
    const [{ data: s }, { data: r }, { data: t }] = await Promise.all([
      supabase.rpc('customer_segments'),
      supabase.rpc('campaign_results'),
      supabase.from('tenants').select('settings').eq('id', membership.tenantId).maybeSingle(),
    ]);
    setSegs((s as Seg[]) ?? []);
    setResults((r as Result[]) ?? []);
    const cfg = (t?.settings as { loyalty?: { enabled?: boolean; earn_per_100?: number; point_value_minor?: number } } | null)?.loyalty;
    setEnabled(!!cfg?.enabled);
    setEarn(String(cfg?.earn_per_100 ?? 1));
    setValue(String((cfg?.point_value_minor ?? 100) / 100));
  }, [membership]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const segmentNames = ['Win-back', 'Birthday this week', 'Big spender', 'New'];
  const list = segs.filter((s) => s.segment === segment);

  function pickSegment(s: string) {
    setSegment(s);
    setMessage(DEFAULT_MESSAGE[s] ?? '');
  }

  async function send(c: Seg) {
    if (!membership) return;
    const digits = c.phone.replace(/\D/g, '').slice(-10);
    const text = message.replaceAll('{name}', c.name ?? 'there').replaceAll('{restaurant}', membership.tenantName ?? 'us');
    const campaign = `${segment} · ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
    await supabase.from('campaign_sends').insert({ tenant_id: membership.tenantId, campaign, customer_id: c.customer_id, sent_by: membership.id });
    setSent((prev) => new Set(prev).add(c.customer_id));
    Linking.openURL(`https://wa.me/91${digits}?text=${encodeURIComponent(text)}`).catch(() => Alert.alert('Could not open WhatsApp', 'Make sure WhatsApp is installed.'));
  }

  async function saveLoyalty() {
    const e = Number(earn);
    const v = Math.round(Number(value) * 100);
    if (!Number.isFinite(e) || e < 0 || !Number.isFinite(v) || v < 0) {
      Alert.alert('Check the numbers', 'Use plain numbers.');
      return;
    }
    const { error } = await supabase.rpc('set_loyalty_settings', { p_enabled: enabled, p_earn_per_100: e, p_point_value_minor: v });
    if (error) Alert.alert('Could not save', error.message);
    else Alert.alert('Saved', enabled ? 'Loyalty points are on.' : 'Loyalty points are off.');
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Customer growth</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {TABS.map(([k, l]) => <Chip key={k} label={l} on={tab === k} onPress={() => setTab(k)} />)}
        </ScrollView>

        {tab === 'segments' ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {segmentNames.map((s) => <Chip key={s} label={`${s} · ${segs.filter((x) => x.segment === s).length}`} on={segment === s} onPress={() => pickSegment(s)} />)}
            </ScrollView>
            <Field label="Message (use {name} and {restaurant})" value={message} onChangeText={setMessage} multiline />
            <Text style={{ fontSize: 12, color: colors.ink500 }}>
              Tapping WhatsApp opens a chat from your own phone with the message ready to send. Only guests who agreed to receive offers can be messaged.
            </Text>
            {list.map((c) => (
              <View key={c.customer_id} style={[card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{c.name ?? c.phone}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink500 }}>
                    {c.visits} visits · {rupees(c.spend_minor, 0)}{c.days_since !== null ? ` · last visit ${c.days_since} days ago` : ''}{c.points > 0 ? ` · ${c.points} points` : ''}
                  </Text>
                </View>
                {c.consent ? (
                  <Pressable onPress={() => send(c)} style={{ height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: sent.has(c.customer_id) ? colors.successBg : '#25D366', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: sent.has(c.customer_id) ? colors.success : '#FFFFFF' }}>{sent.has(c.customer_id) ? 'Sent' : 'WhatsApp'}</Text>
                  </Pressable>
                ) : (
                  <Text style={{ fontSize: 11, fontFamily: fonts.bodyBold, color: colors.ink500 }}>No consent</Text>
                )}
              </View>
            ))}
            {list.length === 0 ? <Text style={{ color: colors.ink500 }}>No one in this group right now.</Text> : null}
          </>
        ) : null}

        {tab === 'loyalty' ? (
          <View style={card}>
            <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Loyalty points</Text>
            <Text style={{ fontSize: 13, color: colors.ink700 }}>
              Guests earn points on every paid bill that has their phone number on it, and spend them as a discount at the counter.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="On" on={enabled} onPress={() => setEnabled(true)} />
              <Chip label="Off" on={!enabled} onPress={() => setEnabled(false)} />
            </View>
            <Field label="Points earned for every ₹100 spent" value={earn} onChangeText={setEarn} keyboardType="decimal-pad" />
            <Field label="Value of one point when spent (₹)" value={value} onChangeText={setValue} keyboardType="decimal-pad" />
            <Text style={heading}>EXAMPLE</Text>
            <Text style={{ fontSize: 13, color: colors.ink700 }}>
              A ₹1,000 bill earns {Math.floor(10 * (Number(earn) || 0))} points, worth {rupees(Math.floor(10 * (Number(earn) || 0)) * Math.round((Number(value) || 0) * 100), 0)} on a later bill.
            </Text>
            {canSettings ? <Button label="Save" onPress={saveLoyalty} /> : <Text style={{ fontSize: 12, color: colors.ink500 }}>Only the owner can change loyalty settings.</Text>}
          </View>
        ) : null}

        {tab === 'results' ? (
          <>
            <Text style={{ fontSize: 13, color: colors.ink700 }}>A guest counts as returned if they paid for an order within 14 days after you messaged them.</Text>
            {results.map((r) => (
              <View key={r.campaign} style={card}>
                <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{r.campaign}</Text>
                <Text style={{ fontSize: 13, color: colors.ink700 }}>
                  {r.sent} messaged · {r.returned} came back{r.sent > 0 ? ` (${Math.round((r.returned / r.sent) * 100)}%)` : ''} · {rupees(r.revenue_minor, 0)} in orders
                </Text>
              </View>
            ))}
            {results.length === 0 ? <Text style={{ color: colors.ink500 }}>No campaigns yet. Send your first message from the first tab.</Text> : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Growth() {
  return (
    <RequireAccess permission="customers.view">
      <GrowthScreen />
    </RequireAccess>
  );
}
