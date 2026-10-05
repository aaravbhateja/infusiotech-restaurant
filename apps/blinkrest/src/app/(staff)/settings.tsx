import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedToggle } from '@/components/AnimatedToggle';
import { Icon, type IconName } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { menuImageUrl } from '@/lib/menuImage';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

// route is required on purpose: every row must lead somewhere real. A row
// with no destination ("coming soon") is grounds for store-review rejection.
type Row = { label: string; sub: string; icon: IconName; bg: string; fg: string; route: string };

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'RESTAURANT',
    rows: [
      { label: 'Restaurant profile', sub: 'Name, cuisine, address', icon: 'store', bg: colors.coral50, fg: colors.coral600, route: '/(staff)/settings/profile' },
      { label: 'Logo & photos', sub: 'Logo and cover photo', icon: 'image', bg: colors.coral50, fg: colors.coral600, route: '/(staff)/settings/profile' },
      { label: 'Menu colours', sub: 'Brand color for the customer menu', icon: 'sparkle', bg: colors.coral50, fg: colors.coral600, route: '/(staff)/settings/branding' },
      { label: 'Contact details', sub: 'Phone and email guests can reach you on', icon: 'phone', bg: colors.coral50, fg: colors.coral600, route: '/(staff)/settings/profile' },
      { label: 'Business hours', sub: 'When you open and close', icon: 'clock', bg: colors.coral50, fg: colors.coral600, route: '/(staff)/settings/profile' },
      { label: 'Branches', sub: 'Multi-branch management', icon: 'pin', bg: colors.coral50, fg: colors.coral600, route: '/select-restaurant' },
    ],
  },
  {
    title: 'OPERATIONS',
    rows: [
      { label: 'Order settings', sub: 'Auto-accept, SLA, KOT printing', icon: 'orders', bg: '#EAF1FF', fg: '#1F5BD6', route: '/(staff)/settings/orders' },
      { label: 'Table settings', sub: 'Manage tables and areas', icon: 'tables', bg: '#EAF1FF', fg: '#1F5BD6', route: '/(staff)/tables' },
      { label: 'QR codes', sub: 'Download, reprint, or rotate table codes', icon: 'qr', bg: '#EAF1FF', fg: '#1F5BD6', route: '/(staff)/tables' },
    ],
  },
  {
    title: 'MONEY',
    rows: [
      { label: 'Tax settings', sub: 'GST rate for new orders', icon: 'percent', bg: colors.successBg, fg: colors.success, route: '/(staff)/settings/profile' },
      { label: 'Payment settings', sub: 'Transactions and reconciliation', icon: 'card', bg: colors.successBg, fg: colors.success, route: '/(staff)/payments' },
      { label: 'Online payments & KYC', sub: 'Submit PAN, Aadhar & bank details to accept online payments', icon: 'shield', bg: colors.successBg, fg: colors.success, route: '/(staff)/settings/payments-kyc' },
      { label: 'Subscription', sub: 'Plan, billing', icon: 'crown', bg: colors.successBg, fg: colors.success, route: '/(staff)/subscription' },
    ],
  },
  {
    title: 'TEAM & ACCOUNT',
    rows: [
      { label: 'Staff', sub: 'Team, invites, role templates', icon: 'users', bg: '#F1EBFF', fg: '#5B21B6', route: '/(staff)/staff' },
      { label: 'Security', sub: 'Signed-in devices', icon: 'shield', bg: '#F1EBFF', fg: '#5B21B6', route: '/(staff)/settings/security' },
      { label: 'Notifications', sub: 'Orders, payments, staff, system', icon: 'bell', bg: '#F1EBFF', fg: '#5B21B6', route: '/(staff)/notifications' },
      { label: 'Help & support', sub: 'FAQs, tickets, call us', icon: 'help', bg: '#F1EBFF', fg: '#5B21B6', route: '/(staff)/support' },
    ],
  },
];

function initials(text: string | undefined) {
  if (!text) return 'BR';
  return text.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || 'BR';
}

function SettingsScreen() {
  const { membership } = useAuth();
  const [address, setAddress] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [logoPath, setLogoPath] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!membership) return;
    const { data } = await supabase.from('tenants').select('address, settings, logo_path').eq('id', membership.tenantId).maybeSingle();
    setAddress(data?.address ?? null);
    setAccepting((data?.settings as { accepting_orders?: boolean } | null)?.accepting_orders !== false);
    setLogoPath(data?.logo_path ?? null);
  }, [membership]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  function go(row: Row) {
    router.push(row.route as never);
  }

  async function toggleAccepting() {
    if (!membership) return;
    const next = !accepting;
    setAccepting(next);
    setToggling(true);
    const { data: current } = await supabase.from('tenants').select('settings').eq('id', membership.tenantId).maybeSingle();
    const { error } = await supabase
      .from('tenants')
      .update({ settings: { ...(current?.settings ?? {}), accepting_orders: next } })
      .eq('id', membership.tenantId);
    setToggling(false);
    if (error) {
      setAccepting(!next);
      Alert.alert('Could not update', error.message);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 28, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Settings</Text>
        </View>

        <Pressable
          onPress={() => router.push('/(staff)/settings/profile' as never)}
          style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}
        >
          <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: colors.ink900, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {logoPath ? (
              <Image source={{ uri: menuImageUrl(logoPath) ?? undefined }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.saffron400 }}>{initials(membership?.tenantName)}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{membership?.tenantName}</Text>
            <Text style={{ fontSize: 13, color: colors.ink500 }}>{address ?? 'Add your address'}</Text>
          </View>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F7F1EC', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="edit" size={19} color={colors.ink900} />
          </View>
        </Pressable>

        <Pressable
          disabled={toggling}
          onPress={toggleAccepting}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: accepting ? colors.successBg : colors.errorBg, borderRadius: 20, padding: 14 }}
        >
          <Icon name="store" size={22} color={accepting ? colors.success : colors.error} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{accepting ? 'Accepting orders' : 'Orders paused'}</Text>
            <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: accepting ? colors.success : colors.error }}>
              {accepting ? 'Pause during a rush or power cut' : 'Guests can browse but not order'}
            </Text>
          </View>
          <AnimatedToggle value={accepting} onValueChange={toggleAccepting} onColor={colors.success} disabled={toggling} />
        </Pressable>

        {GROUPS.map((g) => (
          <View key={g.title} style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 1, marginHorizontal: 4 }}>{g.title}</Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', overflow: 'hidden' }}>
              {g.rows.map((r, i) => (
                <Pressable
                  key={r.label}
                  onPress={() => go(r)}
                  style={{ minHeight: 64, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i < g.rows.length - 1 ? 1 : 0, borderBottomColor: '#F4ECE6' }}
                >
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: r.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={r.icon} size={19} stroke={2.1} color={r.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{r.label}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 12, color: colors.ink500 }}>{r.sub}</Text>
                  </View>
                  <Icon name="right" size={18} stroke={2.2} color="#B9AEA8" />
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Settings() {
  return (
    <RequireAccess permission="settings.manage">
      <SettingsScreen />
    </RequireAccess>
  );
}
