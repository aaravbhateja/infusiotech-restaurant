import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ColorPickerBox } from '@/components/ColorPickerBox';
import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { deriveBrandPalette, isValidHexColor } from '@/lib/brandColor';
import { guardOnline } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

const SWATCHES = ['#FF5A36', '#E11D48', '#EA580C', '#D97706', '#16A34A', '#0D9488', '#2563EB', '#7C3AED', '#DB2777', '#1B1716'];

function BrandingScreen() {
  const { membership } = useAuth();
  const isOnline = useIsOnline();
  const [hex, setHex] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);

  // Only the on-screen back button leaves this page: swallow the Android
  // system back gesture/button so an accidental swipe can't drop unsaved
  // colour changes (iOS swipe-back is disabled in the stack layout).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const load = useCallback(async () => {
    if (!membership) return;
    const { data } = await supabase.from('tenants').select('brand_colors').eq('id', membership.tenantId).maybeSingle();
    const primary = (data?.brand_colors as { primary?: string } | null)?.primary ?? '';
    setHex(primary);
    setSaved(primary);
  }, [membership]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const trimmed = hex.trim();
  const valid = trimmed === '' || isValidHexColor(trimmed);
  const palette = deriveBrandPalette(valid ? trimmed || null : null);
  const dirty = trimmed !== saved;

  async function save() {
    if (!membership || !valid) return;
    if (!guardOnline(isOnline)) return;
    setSaving(true);
    const { error } = await supabase
      .from('tenants')
      .update({ brand_colors: trimmed ? { primary: trimmed.toUpperCase() } : {} })
      .eq('id', membership.tenantId);
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    setSaved(trimmed);
  }

  function resetToDefault() {
    setHex('');
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(staff)/settings' as never))} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>Menu branding</Text>
        </View>

        <Text style={{ fontSize: 13, color: colors.ink500 }}>
          Sets the header, buttons and accents on the menu your customers see after scanning a table QR code.
        </Text>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', overflow: 'hidden' }}>
          <View style={{ backgroundColor: palette.primary, padding: 16, gap: 10 }}>
            <View style={{ height: 28, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.9)', alignSelf: 'flex-start', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>TABLE 7</Text>
            </View>
            <Text style={{ fontSize: 24, fontFamily: fonts.display, color: palette.onPrimary }}>{membership?.tenantName ?? 'Your restaurant'}</Text>
          </View>
          <View style={{ padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: palette.tint, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="flame" size={18} color={palette.dark} />
              </View>
              <Text style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: palette.darker }}>Chef&rsquo;s special</Text>
            </View>
            <View style={{ height: 48, borderRadius: radius.pill, backgroundColor: palette.dark, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>Place order</Text>
            </View>
          </View>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 14 }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Brand color</Text>
          <ColorPickerBox value={valid && trimmed ? trimmed : '#FF5A36'} onChange={setHex} />
          <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink700, marginTop: -4 }}>Quick picks</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {SWATCHES.map((s) => (
              <Pressable
                key={s}
                onPress={() => setHex(s)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: s,
                  borderWidth: trimmed.toUpperCase() === s ? 3 : 0,
                  borderColor: colors.ink900,
                }}
              />
            ))}
          </View>
          <TextField label="Hex color" value={hex} onChangeText={setHex} placeholder="#FF5A36" autoCapitalize="characters" error={!valid ? 'Enter a valid hex color, e.g. #FF5A36' : undefined} />
          {trimmed ? (
            <Pressable onPress={resetToDefault}>
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.coral600 }}>Reset to default coral</Text>
            </Pressable>
          ) : (
            <Text style={{ fontSize: 12, color: colors.ink500 }}>Using BlinkRest&rsquo;s default coral.</Text>
          )}
        </View>
      </ScrollView>

      <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, padding: 16, paddingBottom: 28 }}>
        <Pressable
          disabled={!valid || !dirty || saving}
          onPress={save}
          style={{ height: 56, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center', opacity: !valid || !dirty || saving ? 0.5 : 1 }}
        >
          <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF', fontSize: 16 }}>{saving ? 'Saving…' : 'Save changes'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function Branding() {
  return (
    <RequireAccess permission="menu.branding.manage">
      <BrandingScreen />
    </RequireAccess>
  );
}
