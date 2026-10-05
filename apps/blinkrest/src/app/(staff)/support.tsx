import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { SUPPORT_EMAIL, SUPPORT_PHONE } from '@/lib/contact';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

type Kind = 'problem' | 'question' | 'feature';

const ACTIONS: { kind: Kind; label: string; sub: string; icon: IconName; bg: string; fg: string }[] = [
  { kind: 'problem', label: 'Report a problem', sub: 'We reply in minutes', icon: 'alert', bg: colors.errorBg, fg: colors.error },
  { kind: 'question', label: 'Ask a question', sub: 'Billing, setup, how-to', icon: 'ticket', bg: colors.coral50, fg: colors.coral600 },
  { kind: 'feature', label: 'Request a feature', sub: 'Shape the roadmap', icon: 'sparkle', bg: '#F1EBFF', fg: '#5B21B6' },
];

const FAQS: { q: string; a: string }[] = [
  { q: 'How do I print KOTs automatically?', a: 'Settings › Printers › Kitchen printer, then turn on "Print KOT when an order is accepted". Each item prints at its station.' },
  { q: 'Can I pause orders during a rush?', a: 'Yes. Settings › Accepting orders. QR guests see a friendly "kitchen is busy" message until you turn it back on.' },
  { q: 'How do UPI refunds work?', a: "Refunds go back to the customer's UPI account, usually within minutes. You can track each one in Payments › Refunds." },
  { q: 'How do I add a staff member?', a: 'More › Staff › Invite. Pick a role template; you can fine-tune permissions before sending the invite.' },
];

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  open: { bg: '#EAF1FF', fg: '#1F5BD6', label: 'Open' },
  in_progress: { bg: '#EAF1FF', fg: '#1F5BD6', label: 'In progress' },
  resolved: { bg: colors.successBg, fg: colors.success, label: 'Resolved' },
  planned: { bg: '#F1EBFF', fg: '#5B21B6', label: 'Planned' },
};

type Ticket = { id: string; kind: Kind; title: string; status: string; created_at: string };

export default function Support() {
  const { membership } = useAuth();
  const [openFaq, setOpenFaq] = useState(0);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [composing, setComposing] = useState<Kind | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('support_tickets').select('id, kind, title, status, created_at').order('created_at', { ascending: false });
    setTickets(data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function send() {
    if (!membership || !composing || !title.trim()) return;
    setSending(true);
    const { error } = await supabase.rpc('create_support_ticket', { p_tenant_id: membership.tenantId, p_kind: composing, p_title: title.trim(), p_body: body.trim() || null });
    setSending(false);
    if (error) {
      Alert.alert('Could not send', error.message);
      return;
    }
    setTitle('');
    setBody('');
    setComposing(null);
    load();
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Help & support</Text>
        </View>

        <View style={{ backgroundColor: colors.coral500, borderRadius: 26, padding: 18, gap: 14 }}>
          <Text style={{ fontSize: 24, fontFamily: fonts.display, color: colors.ink900, lineHeight: 29 }}>How can we help, {membership?.tenantName}?</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)} style={{ flex: 1, height: 70, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Icon name="phone" size={21} color={colors.ink900} />
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Call us</Text>
            </Pressable>
            <Pressable onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} style={{ flex: 1, height: 70, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Icon name="mail" size={21} color={colors.ink900} />
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Email</Text>
            </Pressable>
          </View>
          <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Support hours 9 AM – 11 PM, all days · typical reply in 10 min</Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {ACTIONS.map((a) => (
            <Pressable key={a.kind} onPress={() => setComposing(a.kind)} style={{ width: '31%', minHeight: 96, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', backgroundColor: colors.surface, padding: 12, justifyContent: 'space-between', gap: 8 }}>
              <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: a.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={a.icon} size={21} stroke={2.1} color={a.fg} />
              </View>
              <View>
                <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{a.label}</Text>
                <Text style={{ fontSize: 11, color: colors.ink500 }}>{a.sub}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {composing ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 10 }}>
            <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>
              {ACTIONS.find((a) => a.kind === composing)?.label}
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Short summary"
              placeholderTextColor={colors.ink500}
              style={{ height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 14, fontSize: 15, color: colors.ink900, fontFamily: fonts.body }}
            />
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Details (optional)"
              placeholderTextColor={colors.ink500}
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, padding: 14, fontSize: 15, color: colors.ink900, fontFamily: fonts.body, textAlignVertical: 'top' }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setComposing(null)} style={{ flex: 1, height: 48, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Cancel</Text>
              </Pressable>
              <Pressable disabled={sending || !title.trim()} onPress={send} style={{ flex: 1, height: 48, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>{sending ? 'Sending…' : 'Send'}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900, marginHorizontal: 4 }}>Popular questions</Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', overflow: 'hidden' }}>
            {FAQS.map((f, i) => {
              const isOpen = openFaq === i;
              return (
                <View key={f.q} style={{ borderBottomWidth: i < FAQS.length - 1 ? 1 : 0, borderBottomColor: '#F4ECE6' }}>
                  <Pressable onPress={() => setOpenFaq(isOpen ? -1 : i)} style={{ minHeight: 58, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text style={{ flex: 1, fontSize: 15, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{f.q}</Text>
                    <Icon name={isOpen ? 'up' : 'down'} size={18} stroke={2.2} color={colors.ink500} />
                  </Pressable>
                  {isOpen ? <Text style={{ paddingHorizontal: 16, paddingBottom: 14, fontSize: 14, color: colors.ink700, lineHeight: 20 }}>{f.a}</Text> : null}
                </View>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 4 }}>
            <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>My tickets</Text>
            <Text style={{ fontSize: 13, color: colors.ink500 }}>{tickets.length} total</Text>
          </View>
          {tickets.map((t) => {
            const s = STATUS_STYLE[t.status] ?? STATUS_STYLE.open;
            return (
              <View key={t.id} style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink500 }}>#{t.id.slice(0, 8).toUpperCase()} · {t.kind}</Text>
                  <View style={{ height: 24, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: s.bg, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: s.fg }}>{s.label}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{t.title}</Text>
                <Text style={{ fontSize: 12, color: colors.ink500 }}>{new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
              </View>
            );
          })}
          {tickets.length === 0 ? <Text style={{ color: colors.ink500 }}>No tickets yet.</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
