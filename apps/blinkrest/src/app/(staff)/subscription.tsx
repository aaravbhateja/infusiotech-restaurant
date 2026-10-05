import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius } from '@/theme/tokens';

type Plan = { id: string; key: string; name: string; price_minor: number; entitlements: Record<string, unknown> };
type Sub = { plan_id: string; status: string; period_start: string; period_end: string | null };
type Invoice = { id: string; amount_minor: number; currency: string; status: string; issued_at: string; period_start: string; period_end: string | null; plan: { name: string } | null };

const PLAN_FEATURES: Record<string, string[]> = {
  starter: ['QR menu', 'Direct ordering', 'Basic order dashboard', 'Basic reports'],
  growth: ['Everything in Starter', 'Mobile app operations', 'Live order updates', 'Table management', 'Customer CRM', 'Sales analytics'],
  premium: ['Everything in Growth', 'Advanced analytics', 'Granular staff permissions', 'Multi-branch management', 'Priority support'],
};
const PLAN_TAG: Record<string, string> = {
  starter: 'For a single counter getting started',
  growth: 'Run the whole floor from your phone',
  premium: 'For multi-branch restaurants',
};

function SubscriptionScreen() {
  const { membership } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Sub | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!membership) return;
    const [{ data: planRows }, { data: subRow }, { data: invoiceRows }] = await Promise.all([
      supabase.from('plans').select('id, key, name, price_minor, entitlements').eq('is_active', true).order('price_minor'),
      supabase.from('subscriptions').select('plan_id, status, period_start, period_end').eq('tenant_id', membership.tenantId).maybeSingle(),
      supabase.from('invoices').select('id, amount_minor, currency, status, issued_at, period_start, period_end, plan:plans(name)').eq('tenant_id', membership.tenantId).order('issued_at', { ascending: false }),
    ]);
    setPlans(planRows ?? []);
    setSub(subRow);
    setInvoices((invoiceRows as unknown as Invoice[]) ?? []);
  }, [membership]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const canManage = membership?.permissions.has('subscription.manage') ?? false;
  const currentPlan = plans.find((p) => p.id === sub?.plan_id);

  async function switchTo(plan: Plan) {
    if (!membership) return;
    Alert.alert(`Switch to ${plan.name}?`, 'This updates your plan immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Switch',
        onPress: async () => {
          setSwitching(plan.key);
          const { error } = await supabase.rpc('switch_subscription_plan', { p_tenant_id: membership.tenantId, p_plan_key: plan.key });
          setSwitching(null);
          if (error) Alert.alert('Could not switch plan', error.message);
          else load();
        },
      },
    ]);
  }

  // eslint-disable-next-line react-hooks/purity -- display-only days-remaining calc, not state
  const daysLeft = sub?.period_end ? Math.max(0, Math.round((new Date(sub.period_end).getTime() - Date.now()) / 86400000)) : null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Subscription</Text>
        </View>

        {currentPlan ? (
          <View style={{ backgroundColor: colors.ink900, borderRadius: 26, padding: 18, gap: 12 }}>
            <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.saffron400, letterSpacing: 1 }}>CURRENT PLAN</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text style={{ fontSize: 34, fontFamily: fonts.display, color: '#FFFFFF' }}>{currentPlan.name}</Text>
              <Text style={{ fontSize: 15, color: '#E9E1DC' }}>{formatMinor(currentPlan.price_minor)} / year</Text>
            </View>
            {sub?.period_end ? (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, color: '#FFFFFF' }}>
                  Renews <Text style={{ fontFamily: fonts.bodyExtraBold }}>{new Date(sub.period_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  {daysLeft != null ? <Text style={{ color: '#C9BDB6' }}> · {daysLeft} days left</Text> : null}
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: 13, color: '#C9BDB6' }}>Status: {sub?.status}</Text>
            )}
          </View>
        ) : null}

        <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink900, marginHorizontal: 4 }}>Compare plans</Text>
        {plans.map((p) => {
          const isCur = p.id === sub?.plan_id;
          const up = p.key === 'premium';
          return (
            <View key={p.id} style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: isCur ? 2 : 1, borderColor: isCur ? colors.ink900 : '#F4ECE6', padding: 18, gap: 12 }}>
              {isCur ? (
                <View style={{ alignSelf: 'flex-start', height: 24, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.ink900, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.saffron400, letterSpacing: 0.5 }}>CURRENT PLAN</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>{p.name}</Text>
                <Text style={{ fontSize: 24, fontFamily: fonts.display, color: colors.ink900 }}>{formatMinor(p.price_minor)}<Text style={{ fontSize: 13, fontFamily: fonts.body, color: colors.ink500 }}>/year</Text></Text>
              </View>
              <Text style={{ fontSize: 13, color: colors.ink700, marginTop: -6 }}>{PLAN_TAG[p.key] ?? ''}</Text>
              <View style={{ gap: 8 }}>
                {(PLAN_FEATURES[p.key] ?? []).map((f) => (
                  <View key={f} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="check" size={13} stroke={3} color={colors.success} />
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: fonts.bodySemi, color: colors.ink900 }}>{f}</Text>
                  </View>
                ))}
              </View>
              {canManage ? (
                <Pressable
                  disabled={isCur || switching === p.key}
                  onPress={() => switchTo(p)}
                  style={{ height: 50, borderRadius: radius.pill, backgroundColor: isCur ? '#F7F1EC' : up ? colors.coral600 : '#FFFFFF', borderWidth: isCur || up ? 0 : 1.5, borderColor: '#E4D8D0', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontFamily: fonts.bodyExtraBold, fontSize: 15, color: isCur ? colors.ink700 : up ? '#FFFFFF' : colors.ink900 }}>
                    {isCur ? 'Your current plan' : switching === p.key ? 'Switching…' : up ? 'Upgrade' : 'Switch to this plan'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
        {invoices.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink900, marginHorizontal: 4 }}>Billing history</Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', overflow: 'hidden' }}>
              {invoices.map((inv, i) => (
                <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i < invoices.length - 1 ? 1 : 0, borderBottomColor: '#F4ECE6' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: '#F7F1EC', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="receipt" size={18} color={colors.ink900} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{inv.plan?.name ?? 'Plan'} · {new Date(inv.issued_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                    <Text style={{ fontSize: 12, color: colors.ink500 }}>
                      {new Date(inv.period_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – {inv.period_end ? new Date(inv.period_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'ongoing'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{formatMinor(inv.amount_minor, inv.currency)}</Text>
                    <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.ink500, textTransform: 'uppercase' }}>{inv.status}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Text style={{ fontSize: 12, color: colors.ink500, marginHorizontal: 4 }}>
          Prices exclude 18% GST. Switching here changes your plan immediately; online billing isn&rsquo;t connected yet.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Subscription() {
  return (
    <RequireAccess permission="subscription.manage">
      <SubscriptionScreen />
    </RequireAccess>
  );
}
