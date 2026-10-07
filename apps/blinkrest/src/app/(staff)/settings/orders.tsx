import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedToggle } from '@/components/AnimatedToggle';
import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

type Settings = { auto_accept?: boolean; sla_minutes?: string };

function OrderSettingsScreen() {
  const { membership } = useAuth();
  const [autoAccept, setAutoAccept] = useState(false);
  const [slaMinutes, setSlaMinutes] = useState('5');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!membership) return;
    const { data } = await supabase.from('tenants').select('settings').eq('id', membership.tenantId).maybeSingle();
    const s: Settings = (data?.settings as Settings) ?? {};
    setAutoAccept(!!s.auto_accept);
    setSlaMinutes(s.sla_minutes ?? '5');
  }, [membership]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function toggleAutoAccept() {
    if (!membership) return;
    const next = !autoAccept;
    setAutoAccept(next);
    const { data: current } = await supabase.from('tenants').select('settings').eq('id', membership.tenantId).maybeSingle();
    const { error } = await supabase.from('tenants').update({ settings: { ...(current?.settings ?? {}), auto_accept: next } }).eq('id', membership.tenantId);
    if (error) {
      setAutoAccept(!next);
      Alert.alert('Could not update', error.message);
    }
  }

  async function saveSla() {
    if (!membership) return;
    setSaving(true);
    const { data: current } = await supabase.from('tenants').select('settings').eq('id', membership.tenantId).maybeSingle();
    const { error } = await supabase.from('tenants').update({ settings: { ...(current?.settings ?? {}), sla_minutes: slaMinutes } }).eq('id', membership.tenantId);
    setSaving(false);
    if (error) Alert.alert('Could not save', error.message);
    else router.back();
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>Order settings</Text>
        </View>

        <Pressable
          onPress={toggleAutoAccept}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16 }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Auto-accept new orders</Text>
            <Text style={{ fontSize: 13, color: colors.ink500, marginTop: 2 }}>
              Skip the New step — orders from the QR menu go straight to the kitchen as Accepted.
            </Text>
          </View>
          <AnimatedToggle value={autoAccept} onValueChange={toggleAutoAccept} onColor={colors.success} />
        </Pressable>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 10 }}>
          <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Kitchen SLA</Text>
          <Text style={{ fontSize: 13, color: colors.ink500 }}>
            Orders still waiting to be accepted after this many minutes show up under &quot;Needs your attention&quot; on the Manager home.
          </Text>
          <TextInput
            value={slaMinutes}
            onChangeText={setSlaMinutes}
            keyboardType="number-pad"
            placeholder="5"
            style={{ height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 16, fontSize: 16, color: colors.ink900, backgroundColor: '#FFFFFF' }}
          />
        </View>
      </ScrollView>

      <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, padding: 16, paddingBottom: 28 }}>
        <Pressable disabled={saving} onPress={saveSla} style={{ height: 56, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF', fontSize: 16 }}>{saving ? 'Saving…' : 'Save changes'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function OrderSettings() {
  return (
    <RequireAccess permission="settings.manage">
      <OrderSettingsScreen />
    </RequireAccess>
  );
}
