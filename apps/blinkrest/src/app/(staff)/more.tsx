import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNav } from '@/components/BottomNav';
import { Icon, type IconName } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { unregisterPushToken } from '@/hooks/usePushNotifications';
import { menuImageUrl } from '@/lib/menuImage';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

function initials(text: string) {
  return (
    text
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || 'BR'
  );
}

const TILES: { label: string; sub: string; icon: IconName; bg: string; fg: string; permission?: string }[] = [
  { label: 'Staff', sub: 'Manage team', icon: 'users', bg: '#EAF1FF', fg: '#1F5BD6', permission: 'staff.view' },
  { label: 'Customers', sub: 'CRM', icon: 'user', bg: colors.coral50, fg: colors.coral600, permission: 'customers.view' },
  { label: 'Reports', sub: 'Profit & controls', icon: 'chart', bg: colors.successBg, fg: colors.success, permission: 'reports.financial.view' },
  { label: 'Inventory', sub: 'Stock & recipes', icon: 'list', bg: colors.saffron50, fg: '#8A5A00', permission: 'inventory.view' },
  { label: 'Analytics', sub: 'Reports', icon: 'chart', bg: '#F1EBFF', fg: '#5B21B6', permission: 'analytics.basic.view' },
  { label: 'Payments', sub: 'Ledger', icon: 'card', bg: colors.successBg, fg: colors.success, permission: 'payments.view' },
  { label: 'Offers', sub: 'Promotions', icon: 'percent', bg: colors.saffron50, fg: '#8A5A00', permission: 'offers.manage' },
  { label: 'Reviews', sub: 'Feedback', icon: 'star', bg: '#FFE4DA', fg: colors.coral700, permission: 'reviews.reply' },
  { label: 'Branding', sub: 'Menu colours', icon: 'sparkle', bg: '#FFE4DA', fg: colors.coral700, permission: 'menu.branding.manage' },
];

const ROWS: { label: string; icon: IconName; permission?: string; danger?: boolean }[] = [
  { label: 'Notifications', icon: 'bell' },
  { label: 'Subscription', icon: 'crown', permission: 'subscription.manage' },
  { label: 'Settings', icon: 'settings', permission: 'settings.manage' },
  { label: 'Help & support', icon: 'help' },
  { label: 'Privacy policy', icon: 'shield' },
  { label: 'Delete account', icon: 'trash', danger: true },
];

export default function More() {
  const { membership, memberships } = useAuth();
  const [planName, setPlanName] = useState<string | null>(null);
  const [logoPath, setLogoPath] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!membership) return;
    const [{ data }, { data: tenant }] = await Promise.all([
      supabase.from('subscriptions').select('plans(name)').eq('tenant_id', membership.tenantId).maybeSingle(),
      supabase.from('tenants').select('logo_path').eq('id', membership.tenantId).maybeSingle(),
    ]);
    const plan = Array.isArray((data as any)?.plans) ? (data as any).plans[0] : (data as any)?.plans;
    setPlanName(plan?.name ?? null);
    setLogoPath(tenant?.logo_path ?? null);
  }, [membership]);

  useRealtimeRefresh('moretsx', tenantSubs(membership?.tenantId, ['subscriptions']), load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  function comingSoon(label: string) {
    Alert.alert(label, 'This section is coming soon.');
  }

  const visibleTiles = TILES.filter((t) => !t.permission || membership?.permissions.has(t.permission));
  const visibleRows = ROWS.filter((r) => !r.permission || membership?.permissions.has(r.permission));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        <Text style={{ fontSize: 30, fontFamily: fonts.display, color: colors.ink900, letterSpacing: -1, marginHorizontal: 4 }}>
          More
        </Text>

        <View style={{ backgroundColor: colors.ink900, borderRadius: 26, padding: 16, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.saffron400, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {logoPath ? (
                <Image source={{ uri: menuImageUrl(logoPath) ?? undefined }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <Text style={{ fontFamily: fonts.display, fontSize: 19, color: colors.ink900 }}>
                  {initials(membership?.tenantName ?? 'BlinkRest')}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>{membership?.tenantName}</Text>
              <Text style={{ fontSize: 13, color: '#C9BDB6' }}>{membership?.roleName}</Text>
            </View>
          </View>
          {memberships.length > 1 ? (
            <Pressable
              onPress={() => router.push('/select-restaurant' as never)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 12 }}
            >
              <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="refresh" size={18} stroke={2.2} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>Switch restaurant</Text>
                <Text style={{ fontSize: 12, color: '#C9BDB6' }}>{memberships.length} restaurants</Text>
              </View>
              <Icon name="right" size={18} stroke={2.2} color="#C9BDB6" />
            </Pressable>
          ) : null}
          {planName ? (
            <Pressable
              onPress={() => router.push('/(staff)/subscription' as never)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 12 }}
            >
              <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: colors.coral500, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="crown" size={18} stroke={2.2} color={colors.ink900} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>{planName} plan</Text>
              </View>
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.saffron400 }}>Manage</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 1, marginHorizontal: 4 }}>
            MANAGE
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {visibleTiles.map((t) => (
              <Pressable
                key={t.label}
                onPress={() => {
                  if (t.label === 'Staff') router.push('/(staff)/staff' as never);
                  else if (t.label === 'Analytics') router.push('/(staff)/analytics' as never);
                  else if (t.label === 'Inventory') router.push('/(staff)/inventory' as never);
                  else if (t.label === 'Reports') router.push('/(staff)/reports' as never);
                  else if (t.label === 'Customers') router.push('/(staff)/customers' as never);
                  else if (t.label === 'Payments') router.push('/(staff)/payments' as never);
                  else if (t.label === 'Offers') router.push('/(staff)/offers' as never);
                  else if (t.label === 'Reviews') router.push('/(staff)/reviews' as never);
                  else if (t.label === 'Branding') router.push('/(staff)/settings/branding' as never);
                  else comingSoon(t.label);
                }}
                style={{
                  width: '31%',
                  minHeight: 104,
                  backgroundColor: colors.surface,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: '#F4ECE6',
                  padding: 14,
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={t.icon} size={22} stroke={2.1} color={t.fg} />
                </View>
                <View>
                  <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{t.label}</Text>
                  <Text style={{ fontSize: 11, color: colors.ink500 }}>{t.sub}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 1, marginHorizontal: 4 }}>
            ACCOUNT
          </Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', overflow: 'hidden' }}>
            {visibleRows.map((r, i) => (
              <Pressable
                key={r.label}
                onPress={() => {
                  if (r.label === 'Notifications') router.push('/(staff)/notifications' as never);
                  else if (r.label === 'Settings') router.push('/(staff)/settings' as never);
                  else if (r.label === 'Subscription') router.push('/(staff)/subscription' as never);
                  else if (r.label === 'Help & support') router.push('/(staff)/support' as never);
                  else if (r.label === 'Privacy policy') router.push('/privacy' as never);
                  else if (r.label === 'Delete account') router.push('/(staff)/settings/delete-account' as never);
                  else comingSoon(r.label);
                }}
                style={{
                  minHeight: 60,
                  paddingHorizontal: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderBottomWidth: i < visibleRows.length - 1 ? 1 : 0,
                  borderBottomColor: '#F4ECE6',
                }}
              >
                <Icon name={r.icon} size={21} color={r.danger ? colors.error : colors.ink700} />
                <Text style={{ flex: 1, fontSize: 15, fontFamily: fonts.bodyBold, color: r.danger ? colors.error : colors.ink900 }}>{r.label}</Text>
                <Icon name="right" size={18} stroke={2.2} color="#B9AEA8" />
              </Pressable>
            ))}
            <Pressable
              onPress={async () => {
                await unregisterPushToken();
                await supabase.auth.signOut();
              }}
              style={{ minHeight: 60, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <Icon name="logout" size={21} color={colors.error} />
              <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.error }}>Log out</Text>
            </Pressable>
          </View>
        </View>

        <Text style={{ textAlign: 'center', fontSize: 12, color: colors.ink500, fontFamily: fonts.body, marginTop: 6 }}>
          BlinkRest v1.0.0
        </Text>
      </ScrollView>
      <BottomNav active="more" />
    </SafeAreaView>
  );
}
