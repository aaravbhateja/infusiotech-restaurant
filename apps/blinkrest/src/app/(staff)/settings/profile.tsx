import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedToggle } from '@/components/AnimatedToggle';
import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/hooks/useAuth';
import { menuImageUrl, pickAndUploadMenuImage } from '@/lib/menuImage';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

type Settings = { cuisine?: string; open_time?: string; close_time?: string; accepting_orders?: boolean };

function RestaurantProfileScreen() {
  const { membership } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [openTime, setOpenTime] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [gstPercent, setGstPercent] = useState('');
  const [gstRegistered, setGstRegistered] = useState(false);
  const [gstin, setGstin] = useState('');
  const [fssai, setFssai] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!membership) return;
    const { data } = await supabase
      .from('tenants')
      .select('name, contact_phone, contact_email, address, city, state, pincode, settings, logo_path, cover_image_path, gst_percent, gstin, fssai_license')
      .eq('id', membership.tenantId)
      .maybeSingle();
    if (!data) return;
    const s: Settings = (data.settings as Settings) ?? {};
    setName(data.name ?? '');
    setPhone(data.contact_phone ?? '');
    setEmail(data.contact_email ?? '');
    setAddress(data.address ?? '');
    setCity(data.city ?? '');
    setState(data.state ?? '');
    setPincode(data.pincode ?? '');
    setCuisine(s.cuisine ?? '');
    setOpenTime(s.open_time ?? '');
    setCloseTime(s.close_time ?? '');
    setGstPercent(String(data.gst_percent ?? 5));
    setGstRegistered(!!data.gstin);
    setGstin(data.gstin ?? '');
    setFssai(data.fssai_license ?? '');
    setLogoPath(data.logo_path ?? null);
    setCoverPath(data.cover_image_path ?? null);
  }, [membership]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function choosePhoto(kind: 'logo' | 'cover') {
    if (!membership) return;
    const setUploading = kind === 'logo' ? setUploadingLogo : setUploadingCover;
    const setPath = kind === 'logo' ? setLogoPath : setCoverPath;
    setUploading(true);
    try {
      const path = await pickAndUploadMenuImage(membership.tenantId, kind === 'cover' ? [3, 1] : [1, 1]);
      if (path) setPath(path);
    } catch (e) {
      Alert.alert('Could not add photo', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!membership) return;
    const gst = Math.max(0, Math.min(100, parseFloat(gstPercent || '0')));
    setSaving(true);
    const { data: current } = await supabase.from('tenants').select('settings').eq('id', membership.tenantId).maybeSingle();
    const mergedSettings = { ...(current?.settings ?? {}), cuisine, open_time: openTime, close_time: closeTime };
    const { error } = await supabase
      .from('tenants')
      .update({
        name: name.trim(),
        contact_phone: phone.trim() || null,
        contact_email: email.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        pincode: pincode.trim() || null,
        settings: mergedSettings,
        gst_percent: gst,
        gstin: gstRegistered ? gstin.trim() || null : null,
        fssai_license: fssai.trim() || null,
        logo_path: logoPath,
        cover_image_path: coverPath,
      })
      .eq('id', membership.tenantId);
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    router.back();
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>Restaurant profile</Text>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 14 }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Photos</Text>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <Pressable
              onPress={() => choosePhoto('logo')}
              disabled={uploadingLogo}
              style={{ height: 120, width: 120, borderRadius: 24, borderWidth: 1.5, borderColor: logoPath ? 'transparent' : '#E4D8D0', borderStyle: logoPath ? 'solid' : 'dashed', backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
            >
              {uploadingLogo ? (
                <ActivityIndicator color={colors.coral600} />
              ) : logoPath ? (
                <Image source={{ uri: menuImageUrl(logoPath) ?? undefined }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <View style={{ alignItems: 'center', gap: 4 }}>
                  <Icon name="image" size={24} color={colors.ink500} />
                  <Text style={{ fontSize: 11, fontFamily: fonts.bodyBold, color: colors.ink700 }}>Add logo</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={() => choosePhoto('cover')}
              disabled={uploadingCover}
              style={{ flex: 1, height: 120, borderRadius: 24, borderWidth: 1.5, borderColor: coverPath ? 'transparent' : '#E4D8D0', borderStyle: coverPath ? 'solid' : 'dashed', backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
            >
              {uploadingCover ? (
                <ActivityIndicator color={colors.coral600} />
              ) : coverPath ? (
                <Image source={{ uri: menuImageUrl(coverPath) ?? undefined }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <View style={{ alignItems: 'center', gap: 4 }}>
                  <Icon name="image" size={24} color={colors.ink500} />
                  <Text style={{ fontSize: 11, fontFamily: fonts.bodyBold, color: colors.ink700 }}>Add cover photo</Text>
                </View>
              )}
            </Pressable>
          </View>
          <Text style={{ fontSize: 12, color: colors.ink500 }}>Logo and cover photo shown on your customer QR menu.</Text>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 14 }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Basics</Text>
          <TextField label="Restaurant name" value={name} onChangeText={setName} autoCapitalize="words" />
          <TextField label="Cuisine (e.g. North Indian, Rajasthani)" value={cuisine} onChangeText={setCuisine} autoCapitalize="words" />
          <TextField label="Restaurant address" value={address} onChangeText={setAddress} />
          <TextField label="City" value={city} onChangeText={setCity} autoCapitalize="words" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <TextField label="State" value={state} onChangeText={setState} autoCapitalize="words" />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="PIN code" value={pincode} onChangeText={setPincode} keyboardType="numeric" />
            </View>
          </View>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 14 }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Contact</Text>
          <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 14 }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Business hours</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <TextField label="Opens" value={openTime} onChangeText={setOpenTime} placeholder="12:00 PM" />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="Closes" value={closeTime} onChangeText={setCloseTime} placeholder="11:30 PM" />
            </View>
          </View>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 14 }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Tax & compliance</Text>
          <TextField label="GST (%)" value={gstPercent} onChangeText={setGstPercent} keyboardType="numeric" placeholder="5" />
          <Text style={{ fontSize: 12, color: colors.ink500, marginTop: -8 }}>Applied to every customer bill at checkout.</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bg, borderRadius: 16, padding: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>GST registered?</Text>
              <Text style={{ fontSize: 12, color: colors.ink500, marginTop: 2 }}>Only if your restaurant has a GSTIN.</Text>
            </View>
            <AnimatedToggle value={gstRegistered} onValueChange={() => setGstRegistered((v) => !v)} onColor={colors.success} />
          </View>
          {gstRegistered ? (
            <TextField label="GSTIN" value={gstin} onChangeText={setGstin} placeholder="22AAAAA0000A1Z5" autoCapitalize="characters" />
          ) : null}
          <TextField label="FSSAI license number" value={fssai} onChangeText={setFssai} placeholder="14-digit license number" keyboardType="numeric" />
        </View>
      </ScrollView>

      <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, padding: 16, paddingBottom: 28 }}>
        <Pressable disabled={saving} onPress={save} style={{ height: 56, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF', fontSize: 16 }}>{saving ? 'Saving…' : 'Save changes'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function RestaurantProfile() {
  return (
    <RequireAccess permission="settings.manage">
      <RestaurantProfileScreen />
    </RequireAccess>
  );
}
