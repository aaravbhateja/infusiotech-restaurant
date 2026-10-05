import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

type Review = {
  id: string;
  order_id: string | null;
  customer_name: string | null;
  rating: number;
  comment: string | null;
  reply: string | null;
  created_at: string;
  food_rating: number | null;
  service_rating: number | null;
  speed_rating: number | null;
};

const AVATAR_BGS = ['#FFE7A6', '#E9E1DC', '#CFE0FF', '#C9F0DA'];
const FILTERS: { key: string; label: string }[] = [
  { key: 'All', label: 'All' },
  { key: '5★', label: '5 stars' },
  { key: 'Critical', label: 'Critical (1–2★)' },
  { key: 'Unreplied', label: 'Unreplied' },
];

function initials(text: string | null) {
  if (!text) return '?';
  return text.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

function ReviewsScreen() {
  const { membership } = useAuth();
  const isOnline = useIsOnline();
  const [filter, setFilter] = useState('All');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('reviews')
      .select('id, order_id, customer_name, rating, comment, reply, created_at, food_rating, service_rating, speed_rating')
      .order('created_at', { ascending: false })
      .limit(100);
    setReviews(data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const filtered = reviews.filter((r) => {
    if (filter === 'All') return true;
    if (filter === '5★') return r.rating === 5;
    if (filter === 'Critical') return r.rating <= 2;
    if (filter === 'Unreplied') return !r.reply;
    return true;
  });

  const summary = useMemo(() => {
    if (reviews.length === 0) return { avg: 0, dist: [0, 0, 0, 0, 0], food: 0, service: 0, speed: 0 };
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    const dist = [5, 4, 3, 2, 1].map((s) => reviews.filter((r) => r.rating === s).length);
    const avgOf = (key: 'food_rating' | 'service_rating' | 'speed_rating') => {
      const rated = reviews.filter((r) => r[key] != null);
      return rated.length ? Math.round((rated.reduce((s, r) => s + (r[key] ?? 0), 0) / rated.length) * 10) / 10 : 0;
    };
    return { avg: Math.round(avg * 10) / 10, dist, food: avgOf('food_rating'), service: avgOf('service_rating'), speed: avgOf('speed_rating') };
  }, [reviews]);

  async function sendReply(id: string) {
    const text = (drafts[id] ?? '').trim();
    if (!text) return;
    if (!guardOnline(isOnline)) return;
    setSending(id);
    const { error } = await supabase.rpc('reply_to_review', { p_review_id: id, p_reply: text });
    setSending(null);
    if (error) {
      Alert.alert('Could not send reply', error.message);
      return;
    }
    setDrafts((prev) => ({ ...prev, [id]: '' }));
    load();
  }

  const canReply = membership?.permissions.has('reviews.reply') ?? false;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 28, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Reviews</Text>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: '#F4ECE6', padding: 18, flexDirection: 'row', gap: 18, alignItems: 'center' }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 52, fontFamily: fonts.display, color: colors.ink900 }}>{summary.avg || '—'}</Text>
            <View style={{ flexDirection: 'row', gap: 2 }}>
              {[1, 2, 3, 4, 5].map((i) => <Icon key={i} name="star" size={14} color={i <= Math.round(summary.avg) ? '#E09A00' : '#F2D9A0'} />)}
            </View>
            <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink500 }}>{reviews.length} reviews</Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            {[5, 4, 3, 2, 1].map((s, idx) => {
              const n = summary.dist[idx];
              const w = reviews.length ? Math.round((n / reviews.length) * 100) : 0;
              const c = s >= 4 ? '#0E9F5A' : s === 3 ? colors.saffron400 : '#E5484D';
              return (
                <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ width: 18, fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{s}★</Text>
                  <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: '#F7F1EC' }}>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: c, width: `${w}%` }} />
                  </View>
                  <Text style={{ width: 24, textAlign: 'right', fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink500 }}>{n}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {summary.food || summary.service || summary.speed ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              ['Food', summary.food],
              ['Service', summary.service],
              ['Speed', summary.speed],
            ].map(([label, value]) => (
              <View key={label} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: '#F4ECE6', padding: 12, alignItems: 'center', gap: 2 }}>
                <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>{value || '—'}</Text>
                <Text style={{ fontSize: 11, fontFamily: fonts.bodyBold, color: colors.ink500 }}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map((f) => {
            const on = f.key === filter;
            return (
              <Pressable key={f.key} onPress={() => setFilter(f.key)} style={{ height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? colors.ink900 : colors.surface, borderWidth: on ? 0 : 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: on ? '#FFFFFF' : colors.ink900 }}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {filtered.map((r, i) => {
          const sbg = r.rating >= 4 ? '#0B7A3E' : r.rating === 3 ? '#8A5A00' : '#B42318';
          const critical = r.rating <= 2 && !r.reply;
          return (
            <View key={r.id} style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: AVATAR_BGS[i % AVATAR_BGS.length], alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.display, fontWeight: '800', color: colors.ink900 }}>{initials(r.customer_name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{r.customer_name ?? 'Guest'}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink500 }}>{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
                </View>
                <View style={{ height: 28, paddingHorizontal: 9, borderRadius: 9, backgroundColor: sbg, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="star" size={13} color="#FFFFFF" />
                  <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>{r.rating}.0</Text>
                </View>
              </View>
              {r.food_rating || r.service_rating || r.speed_rating ? (
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {r.food_rating ? (
                    <View style={{ height: 24, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.bg, justifyContent: 'center' }}>
                      <Text style={{ fontSize: 11, fontFamily: fonts.bodyBold, color: colors.ink700 }}>Food {r.food_rating}★</Text>
                    </View>
                  ) : null}
                  {r.service_rating ? (
                    <View style={{ height: 24, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.bg, justifyContent: 'center' }}>
                      <Text style={{ fontSize: 11, fontFamily: fonts.bodyBold, color: colors.ink700 }}>Service {r.service_rating}★</Text>
                    </View>
                  ) : null}
                  {r.speed_rating ? (
                    <View style={{ height: 24, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.bg, justifyContent: 'center' }}>
                      <Text style={{ fontSize: 11, fontFamily: fonts.bodyBold, color: colors.ink700 }}>Speed {r.speed_rating}★</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {r.comment ? <Text style={{ fontSize: 15, lineHeight: 21, color: colors.ink900 }}>{r.comment}</Text> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {r.order_id ? (
                  <Pressable onPress={() => router.push(`/(staff)/orders/${r.order_id}` as never)} style={{ height: 28, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: '#F7F1EC', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Icon name="receipt" size={14} color={colors.ink900} />
                    <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>View order</Text>
                  </Pressable>
                ) : null}
                {critical ? (
                  <View style={{ height: 28, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.errorBg, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.error }}>Needs a reply</Text>
                  </View>
                ) : null}
              </View>
              {r.reply ? (
                <View style={{ borderRadius: 14, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, padding: 12 }}>
                  <Text style={{ fontSize: 13, lineHeight: 19, color: colors.ink900 }}>
                    <Text style={{ fontFamily: fonts.bodyExtraBold }}>Reply</Text> · {r.reply}
                  </Text>
                </View>
              ) : canReply ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={drafts[r.id] ?? ''}
                    onChangeText={(t) => setDrafts((prev) => ({ ...prev, [r.id]: t }))}
                    placeholder="Write a reply…"
                    placeholderTextColor={colors.ink500}
                    style={{ flex: 1, height: 44, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 14, fontSize: 14, color: colors.ink900, fontFamily: fonts.body }}
                  />
                  <Pressable disabled={sending === r.id} onPress={() => sendReply(r.id)} style={{ height: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="send" size={18} color="#FFFFFF" />
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}

        {filtered.length === 0 ? (
          <Text style={{ textAlign: 'center', color: colors.ink500, padding: 24 }}>No reviews yet — they appear after customers rate an order.</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Reviews() {
  return (
    <RequireAccess permission="reviews.reply">
      <ReviewsScreen />
    </RequireAccess>
  );
}
