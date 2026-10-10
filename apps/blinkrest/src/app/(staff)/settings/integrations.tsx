import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, Chip, Field, Sheet, card, heading } from '@/components/inventory/ui';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

const API_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/public-api`;

const SCOPES = [
  ['orders:read', 'Read orders'],
  ['payments:read', 'Read payments'],
  ['menu:read', 'Read menu'],
  ['menu:write', 'Turn dishes on/off'],
] as const;

const EVENTS = [
  ['order.created', 'Order created'],
  ['order.status_changed', 'Order status changed'],
  ['order.paid', 'Order paid'],
  ['payment.recorded', 'Payment recorded'],
] as const;

type Key = { id: string; name: string; prefix: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked_at: string | null };
type Hook = { id: string; url: string; events: string[]; active: boolean; consecutive_failures: number; last_success_at: string | null; last_failure_at: string | null };

const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

const ERRORS: Record<string, string> = {
  url_must_be_https: 'The address must start with https://',
  url_not_public: 'That address points to a private network. Use a public https address.',
  too_many_webhooks: 'You can have up to 5 webhooks. Delete one first.',
  too_many_keys: 'You can have up to 10 active API keys. Revoke one first.',
};

function IntegrationsScreen() {
  const { membership } = useAuth();
  const [keys, setKeys] = useState<Key[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);

  const [keyOpen, setKeyOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [keyScopes, setKeyScopes] = useState<string[]>(['orders:read']);
  const [hookOpen, setHookOpen] = useState(false);
  const [hookUrl, setHookUrl] = useState('https://');
  const [hookEvents, setHookEvents] = useState<string[]>(['order.created', 'order.paid']);
  const [secretShown, setSecretShown] = useState<{ title: string; value: string; note: string } | null>(null);

  const load = useCallback(async () => {
    const [k, h] = await Promise.all([
      supabase.from('api_keys').select('id, name, prefix, scopes, created_at, last_used_at, revoked_at').is('revoked_at', null).order('created_at', { ascending: false }),
      supabase.from('webhook_endpoints').select('id, url, events, active, consecutive_failures, last_success_at, last_failure_at').order('created_at', { ascending: false }),
    ]);
    setKeys((k.data as Key[]) ?? []);
    setHooks((h.data as Hook[]) ?? []);
  }, []);

  useRealtimeRefresh('integrationstsx', tenantSubs(membership?.tenantId, ['webhook_endpoints']), load);

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function createKey() {
    if (!keyName.trim() || keyScopes.length === 0) {
      Alert.alert('Name and at least one permission needed');
      return;
    }
    const { data, error } = await supabase.rpc('create_api_key', { p_name: keyName, p_scopes: keyScopes });
    if (error) {
      Alert.alert('Could not create', ERRORS[error.message] ?? error.message);
      return;
    }
    setKeyOpen(false);
    setKeyName('');
    setSecretShown({ title: 'Your API key', value: (data as { key: string }).key, note: 'Copy it now. For safety it is shown only once and cannot be recovered. If you lose it, revoke it and make a new one.' });
    load();
  }

  async function createHook() {
    if (hookEvents.length === 0) {
      Alert.alert('Pick at least one event');
      return;
    }
    const { data, error } = await supabase.rpc('create_webhook', { p_url: hookUrl.trim(), p_events: hookEvents });
    if (error) {
      Alert.alert('Could not add', ERRORS[error.message] ?? error.message);
      return;
    }
    setHookOpen(false);
    setHookUrl('https://');
    setSecretShown({ title: 'Signing secret', value: (data as { secret: string }).secret, note: 'Use it to check the X-BlinkRest-Signature header on each delivery. It is shown only once.' });
    load();
  }

  function confirm(title: string, message: string, label: string, action: () => Promise<unknown>) {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, style: 'destructive', onPress: async () => { await action(); load(); } },
    ]);
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Integrations</Text>
        </View>
        <Text style={{ fontSize: 13, color: colors.ink700 }}>
          Connect BlinkRest to your accountant, delivery app, CRM or your own software. Give a key only to someone you trust: it can read your sales.
        </Text>

        <Text style={heading}>WEBHOOKS</Text>
        <Text style={{ fontSize: 12, color: colors.ink500 }}>We send a signed message to your address whenever something happens. Failed deliveries are retried for up to 6 hours.</Text>
        {hooks.map((h) => (
          <View key={h.id} style={card}>
            <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }} numberOfLines={2}>{h.url}</Text>
            <Text style={{ fontSize: 12, color: colors.ink700 }}>{h.events.join(', ')}</Text>
            <Text style={{ fontSize: 12, color: h.active ? (h.consecutive_failures > 0 ? colors.error : colors.success) : colors.error }}>
              {h.active ? (h.consecutive_failures > 0 ? `${h.consecutive_failures} recent failures` : 'Working') : 'Paused (too many failures or turned off)'} · last success {ago(h.last_success_at)}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Pressable onPress={async () => { await supabase.rpc('test_webhook', { p_id: h.id }); Alert.alert('Test sent', 'A test event is on its way. Check your receiver, then refresh this screen.'); setTimeout(load, 4000); }} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.ink900, justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodyExtraBold }}>Send test</Text>
              </Pressable>
              <Pressable onPress={async () => { await supabase.rpc('set_webhook_active', { p_id: h.id, p_active: !h.active }); load(); }} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' }}>
                <Text style={{ color: colors.ink900, fontFamily: fonts.bodyBold }}>{h.active ? 'Pause' : 'Resume'}</Text>
              </Pressable>
              <Pressable onPress={() => confirm('Delete this webhook?', 'Events will stop being sent to this address.', 'Delete', async () => supabase.rpc('delete_webhook', { p_id: h.id }))} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' }}>
                <Text style={{ color: colors.error, fontFamily: fonts.bodyBold }}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}
        <Button label="+ Add webhook" tone="dark" onPress={() => setHookOpen(true)} />

        <Text style={heading}>API KEYS</Text>
        {keys.map((k) => (
          <View key={k.id} style={card}>
            <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{k.name}</Text>
            <Text style={{ fontSize: 12, color: colors.ink700 }}>{k.prefix}…  ·  {k.scopes.join(', ')}</Text>
            <Text style={{ fontSize: 12, color: colors.ink500 }}>Last used {ago(k.last_used_at)}</Text>
            <Pressable onPress={() => confirm('Revoke this key?', 'Anything using it stops working immediately.', 'Revoke', async () => supabase.rpc('revoke_api_key', { p_id: k.id }))} style={{ alignSelf: 'flex-start', height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' }}>
              <Text style={{ color: colors.error, fontFamily: fonts.bodyBold }}>Revoke</Text>
            </Pressable>
          </View>
        ))}
        <Button label="+ Create API key" tone="dark" onPress={() => setKeyOpen(true)} />

        <View style={card}>
          <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>How to use</Text>
          <Text style={{ fontSize: 12, color: colors.ink700 }}>API address</Text>
          <Pressable onPress={async () => { await Clipboard.setStringAsync(API_BASE); Alert.alert('Copied'); }}>
            <Text selectable style={{ fontSize: 12, color: colors.info }}>{API_BASE}</Text>
          </Pressable>
          <Text style={{ fontSize: 12, color: colors.ink700, lineHeight: 18 }}>
            {'Send the key as  Authorization: Bearer brk_...\n\nGET /v1/orders?since=2026-01-01T00:00:00Z&status=served\nGET /v1/orders/{id}\nGET /v1/payments?since=...\nGET /v1/menu\nPATCH /v1/menu/{id}  {"available": false}\n\nMoney is in paise. Limit: 120 requests a minute.\n\nWebhook check: HMAC-SHA256 of "<X-BlinkRest-Timestamp>.<raw body>" with your signing secret must equal the X-BlinkRest-Signature value (after "sha256=").'}
          </Text>
        </View>
      </ScrollView>

      <Sheet visible={keyOpen} title="Create API key" onClose={() => setKeyOpen(false)}>
        <Field label="Name (what will use it)" value={keyName} onChangeText={setKeyName} placeholder="e.g. Accountant sync" />
        <Text style={heading}>WHAT IT MAY DO</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SCOPES.map(([v, l]) => <Chip key={v} label={l} on={keyScopes.includes(v)} onPress={() => setKeyScopes(toggle(keyScopes, v))} />)}
        </View>
        <Button label="Create key" onPress={createKey} />
      </Sheet>

      <Sheet visible={hookOpen} title="Add webhook" onClose={() => setHookOpen(false)}>
        <Field label="Receiver address (https only)" value={hookUrl} onChangeText={setHookUrl} placeholder="https://example.com/blinkrest" />
        <Text style={heading}>SEND ME</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {EVENTS.map(([v, l]) => <Chip key={v} label={l} on={hookEvents.includes(v)} onPress={() => setHookEvents(toggle(hookEvents, v))} />)}
        </View>
        <Button label="Add webhook" onPress={createHook} />
      </Sheet>

      <Sheet visible={secretShown !== null} title={secretShown?.title ?? ''} onClose={() => setSecretShown(null)}>
        <Text selectable style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{secretShown?.value}</Text>
        <Text style={{ fontSize: 13, color: colors.ink700 }}>{secretShown?.note}</Text>
        <Button label="Copy" onPress={async () => { if (secretShown) await Clipboard.setStringAsync(secretShown.value); Alert.alert('Copied'); }} />
        <Button label="Done" tone="ghost" onPress={() => setSecretShown(null)} />
      </Sheet>
    </SafeAreaView>
  );
}

export default function Integrations() {
  return (
    <RequireAccess permission="settings.manage">
      <IntegrationsScreen />
    </RequireAccess>
  );
}
