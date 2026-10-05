import { Pressable, Text, View } from 'react-native';

import { colors, fonts, formatMinor, radius, shadow, statusBadge } from '@/theme/tokens';

export type OrderSummary = {
  id: string;
  order_number: string;
  order_status: string;
  total_minor: number;
  currency: string;
  created_at: string;
  table?: { label: string } | null;
};

export function OrderCard({ order, onPress }: { order: OrderSummary; onPress: () => void }) {
  const badge = statusBadge[order.order_status] ?? statusBadge.new;

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: 16,
        borderWidth: 1,
        borderColor: '#F4ECE6',
        gap: 10,
        ...shadow.card,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>
            #{order.order_number}
          </Text>
          {order.table ? (
            <View style={{ backgroundColor: colors.bg, borderRadius: radius.sm, paddingHorizontal: 9, height: 24, justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>
                {order.table.label}
              </Text>
            </View>
          ) : null}
        </View>
        <View
          style={{
            backgroundColor: badge.bg,
            borderRadius: radius.pill,
            paddingHorizontal: 11,
            height: 28,
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: badge.fg }}>{badge.label}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 13, color: colors.ink700, fontFamily: fonts.body }}>
          {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>
          {formatMinor(order.total_minor, order.currency)}
        </Text>
      </View>
    </Pressable>
  );
}
