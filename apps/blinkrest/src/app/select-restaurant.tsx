import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { useAuth, type MembershipSummary } from '@/hooks/useAuth';
import { homePathForRole } from '@/lib/roleHome';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

function initials(text: string | undefined) {
  if (!text) return '?';
  return text.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

type Status = { accepting: boolean; liveOrders: number };

export default function SelectRestaurant() {
  const { session, memberships, selectRestaurant } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const effectiveSelected = selected ?? memberships[0]?.tenantId ?? null;
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadStatuses() {
      const entries = await Promise.all(
        memberships.map(async (m): Promise<[string, Status]> => {
          const [{ data: tenant }, { count }] = await Promise.all([
            supabase.from('tenants').select('settings').eq('id', m.tenantId).maybeSingle(),
            supabase
              .from('orders')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', m.tenantId)
              .in('order_status', ['new', 'accepted', 'preparing', 'ready']),
          ]);
          const accepting = (tenant?.settings as { accepting_orders?: boolean } | null)?.accepting_orders !== false;
          return [m.tenantId, { accepting, liveOrders: count ?? 0 }];
        }),
      );
      if (!cancelled) setStatuses(Object.fromEntries(entries));
    }
    if (memberships.length > 0) loadStatuses();
    return () => {
      cancelled = true;
    };
  }, [memberships]);

  async function continueToSelected() {
    if (!effectiveSelected) return;
    setContinuing(true);
    const result = await selectRestaurant(effectiveSelected);
    setContinuing(false);
    if (result) router.replace(homePathForRole(result.roleName));
  }

  const selectedName = memberships.find((m) => m.tenantId === effectiveSelected)?.tenantName ?? '';
  const displayName = session?.user.user_metadata?.full_name ?? session?.user.email?.split('@')[0] ?? 'there';

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, padding: 20, gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.saffron400, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 17, color: colors.ink900 }}>{initials(displayName)}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 13, color: colors.ink500 }}>Signed in as</Text>
            <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{displayName}</Text>
          </View>
        </View>

        <Text style={{ fontSize: 28, fontFamily: fonts.display, color: colors.ink900, letterSpacing: -0.5, marginTop: 4 }}>
          Where are you working today?
        </Text>

        <View style={{ gap: 10 }}>
          {memberships.map((m: MembershipSummary) => {
            const on = effectiveSelected === m.tenantId;
            const status = statuses[m.tenantId];
            return (
              <Pressable
                key={m.membershipId}
                onPress={() => setSelected(m.tenantId)}
                style={{
                  borderRadius: 22,
                  borderWidth: on ? 2 : 1.5,
                  borderColor: on ? colors.ink900 : '#EFE6DF',
                  backgroundColor: '#FFFFFF',
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: colors.saffron400, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink900 }}>{initials(m.tenantName)}</Text>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{m.tenantName}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <View style={{ height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: '#F1EBFF', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: '#5B21B6' }}>{m.roleName}</Text>
                    </View>
                    {status ? (
                      <View style={{ height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: status.accepting ? colors.successBg : colors.errorBg, justifyContent: 'center' }}>
                        <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: status.accepting ? colors.success : colors.error }}>
                          {status.accepting ? `Open · ${status.liveOrders} live order${status.liveOrders === 1 ? '' : 's'}` : 'Paused'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: on ? 8 : 2, borderColor: on ? colors.coral600 : '#C9BDB6' }} />
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => router.push('/onboarding')}
          style={{ height: 56, borderRadius: 18, borderWidth: 1.5, borderColor: '#E4A08F', borderStyle: 'dashed', backgroundColor: '#FFF8F5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Icon name="plus" size={20} stroke={2.4} color={colors.coral700} />
          <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.coral700 }}>Add a new restaurant</Text>
        </Pressable>

        <View style={{ flex: 1 }} />

        <Button
          title={continuing ? 'Please wait…' : `Continue to ${selectedName}`}
          onPress={continueToSelected}
          disabled={!effectiveSelected || continuing}
          loading={continuing}
          style={{ height: 56, borderRadius: radius.pill }}
        />
      </View>
    </SafeAreaView>
  );
}
