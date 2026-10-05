import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

type Ticket = {
  ticket_id: string;
  tenant_id: string;
  tenant_name: string;
  kind: string;
  title: string;
  body: string | null;
  status: string;
  created_at: string;
  admin_reply: string | null;
  admin_replied_at: string | null;
};

const FILTERS = ['open', 'in_progress', 'resolved', 'planned', 'all'] as const;

export default function AdminSupport() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('open');
  const [loading, setLoading] = useState(true);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (f: (typeof FILTERS)[number]) => {
    setLoading(true);
    const { data } = await supabase.rpc('admin_list_support_tickets', { p_status: f === 'all' ? null : f });
    setTickets((data as Ticket[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-filter-change
    load(filter);
  }, [filter, load]);

  async function sendReply(ticket: Ticket) {
    if (!replyText.trim()) return;
    setSaving(true);
    const { error } = await supabase.rpc('admin_reply_support_ticket', { p_ticket_id: ticket.ticket_id, p_reply: replyText.trim(), p_status: 'resolved' });
    setSaving(false);
    if (error) {
      Alert.alert('Could not send reply', error.message);
      return;
    }
    setReplyingId(null);
    setReplyText('');
    load(filter);
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 20, paddingBottom: 0 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="left" size={20} stroke={2.2} color={colors.ink900} />
        </Pressable>
        <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>Support queue</Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 20 }}>
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={{ height: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: active ? colors.ink900 : colors.surface, borderWidth: active ? 0 : 1.5, borderColor: colors.inputBorder, justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 13, fontFamily: active ? fonts.bodyExtraBold : fonts.bodyBold, color: active ? '#FFFFFF' : colors.ink900, textTransform: 'capitalize' }}>{f.replace('_', ' ')}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 10, paddingBottom: 32 }}>
        {loading ? <Text style={{ color: colors.ink500 }}>Loading…</Text> : null}
        {!loading && tickets.length === 0 ? <Text style={{ color: colors.ink500, textAlign: 'center', padding: 24 }}>Nothing here.</Text> : null}
        {tickets.map((t) => (
          <View key={t.ticket_id} style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900, flex: 1 }}>{t.title}</Text>
              <View style={{ height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.saffron50, justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: '#8A5A00', textTransform: 'uppercase' }}>{t.kind}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 12, color: colors.ink500 }}>{t.tenant_name} · {new Date(t.created_at).toLocaleString()}</Text>
            {t.body ? <Text style={{ fontSize: 14, color: colors.ink700 }}>{t.body}</Text> : null}

            {t.admin_reply ? (
              <View style={{ backgroundColor: colors.successBg, borderRadius: 14, padding: 10, marginTop: 4 }}>
                <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.success }}>Replied</Text>
                <Text style={{ fontSize: 13, color: colors.ink900 }}>{t.admin_reply}</Text>
              </View>
            ) : replyingId === t.ticket_id ? (
              <View style={{ gap: 8 }}>
                <TextInput
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholder="Write a reply…"
                  multiline
                  style={{ borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, padding: 10, fontSize: 14, minHeight: 60, textAlignVertical: 'top' }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => setReplyingId(null)} style={{ flex: 1, height: 42, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={() => sendReply(t)} disabled={saving || !replyText.trim()} style={{ flex: 1, height: 42, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center', opacity: saving || !replyText.trim() ? 0.6 : 1 }}>
                    <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>{saving ? 'Sending…' : 'Send & resolve'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => setReplyingId(t.ticket_id)} style={{ alignSelf: 'flex-start' }}>
                <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.coral600 }}>Reply</Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
