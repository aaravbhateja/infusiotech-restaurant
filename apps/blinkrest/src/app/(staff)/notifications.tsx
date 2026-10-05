import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

type Notification = { id: string; category: string; icon: IconName; title: string; body: string | null; created_at: string; read: boolean };

const CATS = ['All', 'orders', 'payments', 'staff', 'system', 'reviews'];
const CAT_LABEL: Record<string, string> = { orders: 'Orders', payments: 'Payments', staff: 'Staff', system: 'System', reviews: 'Reviews' };
const CAT_TINT: Record<string, [string, string]> = {
  orders: [colors.coral50, colors.coral600],
  payments: [colors.successBg, colors.success],
  staff: ['#EAF1FF', '#1F5BD6'],
  system: ['#F1ECE8', colors.ink700],
  reviews: [colors.saffron50, '#8A5A00'],
};

function groupTitle(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'TODAY';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'YESTERDAY';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }).toUpperCase();
}

function timeLabel(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function Notifications() {
  const { membership } = useAuth();
  const [cat, setCat] = useState('All');
  const [items, setItems] = useState<Notification[]>([]);

  const load = useCallback(async () => {
    if (!membership) return;
    const [{ data: notifs }, { data: reads }] = await Promise.all([
      supabase.from('notifications').select('id, category, icon, title, body, created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('notification_reads').select('notification_id').eq('membership_id', membership.id),
    ]);
    const readSet = new Set((reads ?? []).map((r) => r.notification_id));
    setItems((notifs ?? []).map((n) => ({ ...n, icon: n.icon as IconName, read: readSet.has(n.id) })));
  }, [membership]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
    if (!membership) return;
    const channel = supabase
      .channel('notifications-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `tenant_id=eq.${membership.tenantId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [membership, load]);

  const unreadCount = items.filter((n) => !n.read).length;
  const filtered = items.filter((n) => cat === 'All' || n.category === cat);
  const groups = Array.from(new Set(filtered.map((n) => groupTitle(n.created_at)))).map((title) => ({
    title,
    items: filtered.filter((n) => groupTitle(n.created_at) === title),
  }));

  async function markRead(id: string) {
    if (!membership) return;
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await supabase.rpc('mark_notification_read', { p_notification_id: id });
  }

  async function markAllRead() {
    if (!membership) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.rpc('mark_all_notifications_read', { p_tenant_id: membership.tenantId });
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Notifications</Text>
          {unreadCount > 0 ? (
            <Pressable onPress={markAllRead}>
              <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.coral600 }}>Mark all read</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {CATS.map((c) => {
            const on = c === cat;
            const label = c === 'All' ? `All · ${unreadCount} new` : CAT_LABEL[c];
            return (
              <Pressable key={c} onPress={() => setCat(c)} style={{ height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? colors.ink900 : colors.surface, borderWidth: on ? 0 : 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: on ? '#FFFFFF' : colors.ink900 }}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {groups.map((g) => (
          <View key={g.title} style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 1, marginHorizontal: 4 }}>{g.title}</Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', overflow: 'hidden' }}>
              {g.items.map((n, i) => {
                const tint = CAT_TINT[n.category] ?? CAT_TINT.system;
                return (
                  <Pressable
                    key={n.id}
                    onPress={() => markRead(n.id)}
                    style={{ padding: 14, flexDirection: 'row', gap: 12, backgroundColor: n.read ? colors.surface : '#FFFBF8', borderBottomWidth: i < g.items.length - 1 ? 1 : 0, borderBottomColor: '#F4ECE6' }}
                  >
                    <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: tint[0], alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={n.icon} size={21} stroke={2.1} color={tint[1]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontFamily: n.read ? fonts.bodySemi : fonts.bodyExtraBold, color: colors.ink900, lineHeight: 19 }}>{n.title}</Text>
                      {n.body ? <Text style={{ fontSize: 13, color: colors.ink700, marginTop: 2, lineHeight: 18 }}>{n.body}</Text> : null}
                      <Text style={{ fontSize: 12, color: colors.ink500, marginTop: 4 }}>{timeLabel(n.created_at)}</Text>
                    </View>
                    {!n.read ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.coral600, marginTop: 6 }} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {items.length === 0 ? (
          <Text style={{ textAlign: 'center', color: colors.ink500, padding: 24 }}>No notifications yet — new orders and payments will show up here.</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
