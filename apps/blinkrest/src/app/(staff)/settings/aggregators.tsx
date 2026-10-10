import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, Chip, Field, card, heading } from '@/components/inventory/ui';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

type Conn = { id: string; channels: string[]; zomato_restaurant_id: string | null; swiggy_restaurant_id: string | null; status: string; status_note: string | null; requested_at: string; activated_at: string | null };
type InboxRow = { id: string; received_at: string; result: string | null };

const STATUS: Record<string, { label: string; tone: string; bg: string; text: string }> = {
  requested: { label: 'REQUESTED', tone: '#8A5A00', bg: colors.saffron50, text: 'We have your request. The BlinkRest team will call you to complete the setup with Zomato and Swiggy.' },
  setting_up: { label: 'SETTING UP', tone: colors.info, bg: colors.infoBg, text: 'Setup is in progress. Zomato and Swiggy approve each restaurant themselves, which can take some days.' },
  active: { label: 'LIVE', tone: colors.success, bg: colors.successBg, text: 'Connected. Orders from your channels are received here.' },
  paused: { label: 'PAUSED', tone: colors.ink700, bg: colors.bg, text: 'Paused. New orders from the marketplaces are not being accepted here.' },
  rejected: { label: 'NOT POSSIBLE', tone: colors.error, bg: colors.errorBg, text: 'We could not complete this setup.' },
};

const ERRORS: Record<string, string> = {
  pick_a_channel: 'Pick Zomato, Swiggy or both.',
  zomato_id_required: 'Enter your Zomato restaurant ID.',
  swiggy_id_required: 'Enter your Swiggy restaurant ID.',
  invalid_phone: 'Enter a 10-digit phone number we can call.',
};

const FN_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/aggregator-webhook`;

function AggregatorsScreen() {
  const { membership } = useAuth();
  const [conn, setConn] = useState<Conn | null>(null);
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [info, setInfo] = useState<{ connection_id: string; token: string } | null>(null);
  const [channels, setChannels] = useState<string[]>(['zomato', 'swiggy']);
  const [zId, setZId] = useState('');
  const [sId, setSId] = useState('');
  const [phone, setPhone] = useState('');
  const [showToken, setShowToken] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('aggregator_connections')
      .select('id, channels, zomato_restaurant_id, swiggy_restaurant_id, status, status_note, requested_at, activated_at')
      .maybeSingle();
    setConn((data as Conn | null) ?? null);
    if (data && ['setting_up', 'active', 'paused'].includes((data as Conn).status)) {
      const [i, e] = await Promise.all([
        supabase.rpc('aggregator_inbound_info'),
        supabase.from('aggregator_inbox').select('id, received_at, result').order('received_at', { ascending: false }).limit(8),
      ]);
      setInfo((i.data as { connection_id: string; token: string }) ?? null);
      setInbox((e.data as InboxRow[]) ?? []);
    } else {
      setInfo(null);
      setInbox([]);
    }
  }, []);

  useRealtimeRefresh('aggregatorstsx', tenantSubs(membership?.tenantId, ['aggregator_connections', 'aggregator_inbox']), load);

  const toggle = (c: string) => setChannels((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  async function request() {
    const { error } = await supabase.rpc('request_aggregator_integration', { p_channels: channels, p_zomato_id: zId, p_swiggy_id: sId, p_phone: phone });
    if (error) Alert.alert('Could not send request', ERRORS[error.message] ?? error.message);
    else {
      Alert.alert('Request sent', 'The BlinkRest team will contact you on the number you gave.');
      load();
    }
  }

  const st = conn ? STATUS[conn.status] : null;
  const canRequest = !conn || conn.status === 'rejected' || conn.status === 'requested';
  const url = info ? `${FN_BASE}?c=${info.connection_id}` : '';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Zomato & Swiggy</Text>
        </View>
        <Text style={{ fontSize: 13, color: colors.ink700 }}>
          Receive Zomato and Swiggy orders directly in BlinkRest: they appear for the kitchen like any other order, tagged with the marketplace, and feed your channel earnings report.
        </Text>

        {conn && st ? (
          <View style={[card, { backgroundColor: st.bg }]}>
            <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: st.tone, letterSpacing: 0.6 }}>{st.label} · {conn.channels.join(' + ').toUpperCase()}</Text>
            <Text style={{ fontSize: 14, color: colors.ink900 }}>{st.text}</Text>
            {conn.status_note ? <Text style={{ fontSize: 13, color: colors.ink700 }}>{conn.status_note}</Text> : null}
          </View>
        ) : null}

        {canRequest ? (
          <View style={card}>
            <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{conn ? 'Update your request' : 'Request this integration'}</Text>
            <Text style={{ fontSize: 13, color: colors.ink700 }}>
              You need to be a registered partner on each marketplace. Your restaurant ID is shown in the Zomato or Swiggy partner app or dashboard.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="Zomato" on={channels.includes('zomato')} onPress={() => toggle('zomato')} />
              <Chip label="Swiggy" on={channels.includes('swiggy')} onPress={() => toggle('swiggy')} />
            </View>
            {channels.includes('zomato') ? <Field label="Zomato restaurant ID" value={zId} onChangeText={setZId} /> : null}
            {channels.includes('swiggy') ? <Field label="Swiggy restaurant ID" value={sId} onChangeText={setSId} /> : null}
            <Field label="Phone number to call you on" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Button label={conn ? 'Send again' : 'Send request'} onPress={request} />
          </View>
        ) : null}

        {info ? (
          <View style={card}>
            <Text style={heading}>FOR THE BLINKREST TEAM</Text>
            <Text style={{ fontSize: 12, color: colors.ink700 }}>
              This private address is where the integration partner sends your orders. You do not need to do anything with it.
            </Text>
            <Pressable onPress={async () => { await Clipboard.setStringAsync(url); Alert.alert('Address copied'); }}>
              <Text selectable style={{ fontSize: 11, color: colors.info }}>{url}</Text>
            </Pressable>
            <Pressable onPress={() => setShowToken((v) => !v)}>
              <Text style={{ fontSize: 12, color: colors.ink900, fontFamily: fonts.bodyBold }}>{showToken ? info.token : 'Show access token'}</Text>
            </Pressable>
          </View>
        ) : null}

        {conn && ['active', 'paused'].includes(conn.status) ? (
          <Button
            label={conn.status === 'active' ? 'Pause marketplace orders' : 'Resume marketplace orders'}
            tone={conn.status === 'active' ? 'ghost' : 'primary'}
            onPress={async () => { await supabase.rpc('set_aggregator_paused', { p_paused: conn.status === 'active' }); load(); }}
          />
        ) : null}

        {inbox.length > 0 ? (
          <>
            <Text style={heading}>RECENT MARKETPLACE EVENTS</Text>
            {inbox.map((r) => (
              <View key={r.id} style={card}>
                <Text style={{ fontSize: 13, color: colors.ink900 }}>{new Date(r.received_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
                <Text style={{ fontSize: 12, color: r.result?.startsWith('error') ? colors.error : colors.ink700 }}>{r.result ?? 'received'}</Text>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Aggregators() {
  return (
    <RequireAccess permission="settings.manage">
      <AggregatorsScreen />
    </RequireAccess>
  );
}
