import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedToggle } from '@/components/AnimatedToggle';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { isAlreadyMemberError } from '@/lib/authErrors';
import { guardOnline } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).slice(2, 6)
  );
}

// Picked here but not uploaded yet — there's no tenant (and so no storage
// folder) to upload into until create_tenant_and_owner returns an id.
async function pickImage(aspect: [number, number]): Promise<ImagePicker.ImagePickerAsset | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library access is needed to add a photo.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.7 });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0];
}

async function uploadImage(tenantId: string, asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const ext = asset.fileName?.split('.').pop()?.toLowerCase() || asset.uri.split('.').pop()?.split('?')[0] || 'jpg';
  const path = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const response = await fetch(asset.uri);
  const arrayBuffer = await response.arrayBuffer();
  const contentType = asset.mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const { error } = await supabase.storage.from('menu-images').upload(path, arrayBuffer, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

const STEPS = ['Account', 'Restaurant', 'Menu', 'Go live'];
const MIN_PASSWORD_LENGTH = 8;

export default function Onboarding() {
  const { refreshMembership } = useAuth();
  const isOnline = useIsOnline();
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [openTime, setOpenTime] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [gstPercent, setGstPercent] = useState('5');
  const [gstRegistered, setGstRegistered] = useState(false);
  const [gstin, setGstin] = useState('');
  const [fssai, setFssai] = useState('');
  const [logoAsset, setLogoAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [coverAsset, setCoverAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [pickingLogo, setPickingLogo] = useState(false);
  const [pickingCover, setPickingCover] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const missingField =
    !name.trim() ? 'restaurant name' :
    !ownerName.trim() ? 'your name' :
    !cuisine.trim() ? 'cuisine' :
    !address.trim() ? 'address' :
    !city.trim() ? 'city' :
    !state.trim() ? 'state' :
    !pincode.trim() ? 'PIN code' :
    !phone.trim() ? 'phone number' :
    !email.trim() ? 'email' :
    !openTime.trim() ? 'opening time' :
    !closeTime.trim() ? 'closing time' :
    !gstPercent.trim() ? 'GST rate' :
    gstRegistered && !gstin.trim() ? 'GSTIN' :
    !fssai.trim() ? 'FSSAI license number' :
    null;

  async function choosePhoto(kind: 'logo' | 'cover') {
    const setPicking = kind === 'logo' ? setPickingLogo : setPickingCover;
    const setAsset = kind === 'logo' ? setLogoAsset : setCoverAsset;
    setPicking(true);
    try {
      const asset = await pickImage(kind === 'cover' ? [3, 1] : [1, 1]);
      if (asset) setAsset(asset);
    } catch (e) {
      Alert.alert('Could not add photo', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setPicking(false);
    }
  }

  async function createRestaurant() {
    if (loading) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords don’t match.');
      return;
    }
    if (missingField) {
      setError(`Enter your ${missingField} to continue.`);
      return;
    }
    if (!guardOnline(isOnline)) return;
    setLoading(true);
    setError(null);
    setPasswordError(null);

    const { data: userData, error: passwordUpdateError } = await supabase.auth.updateUser({ password });
    if (passwordUpdateError) {
      setLoading(false);
      setPasswordError(passwordUpdateError.message);
      return;
    }

    if (userData.user) {
      await supabase.from('users').update({ display_name: ownerName.trim() }).eq('id', userData.user.id);
    }

    const { data, error: createError } = await supabase.rpc('create_tenant_and_owner', {
      p_name: name.trim(),
      p_slug: slugify(name),
    });
    if (createError) {
      if (isAlreadyMemberError(createError.message)) {
        // A restaurant was already created for this account (often from an
        // earlier attempt) — recover into it instead of dead-ending here.
        await refreshMembership();
        router.replace('/(staff)/home');
        return;
      }
      setLoading(false);
      setError(createError.message);
      return;
    }

    const tenantId = (data as { tenant_id: string }).tenant_id;

    let logoPath: string | null = null;
    let coverPath: string | null = null;
    try {
      if (logoAsset) logoPath = await uploadImage(tenantId, logoAsset);
      if (coverAsset) coverPath = await uploadImage(tenantId, coverAsset);
    } catch (e) {
      // The account and restaurant already exist at this point — a failed
      // photo upload shouldn't trap the owner outside their own app.
      Alert.alert('Restaurant created', `Everything's set up, but the photo upload failed: ${e instanceof Error ? e.message : 'please try again'}. Add it anytime from Settings.`);
    }

    const { error: detailsError } = await supabase
      .from('tenants')
      .update({
        contact_phone: phone.trim(),
        contact_email: email.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        settings: { cuisine: cuisine.trim(), open_time: openTime.trim(), close_time: closeTime.trim() },
        gst_percent: Math.max(0, Math.min(100, parseFloat(gstPercent || '0'))),
        gstin: gstRegistered ? gstin.trim() : null,
        fssai_license: fssai.trim(),
        logo_path: logoPath,
        cover_image_path: coverPath,
      })
      .eq('id', tenantId);

    if (detailsError) {
      Alert.alert('Restaurant created', `Your account is ready, but some details didn't save: ${detailsError.message}. You can fix them in Settings.`);
    }

    await refreshMembership();
    router.replace('/(staff)/home');
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink700, textAlign: 'center' }}>
          Step 2 of 4
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginTop: 14 }}>
        {STEPS.map((step, i) => (
          <View key={step} style={{ flex: 1, gap: 6 }}>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: i === 0 ? colors.success : i === 1 ? colors.coral500 : colors.disabledBg,
              }}
            />
            <Text
              style={{
                fontSize: 11,
                fontFamily: fonts.bodyExtraBold,
                color: i === 0 ? colors.success : i === 1 ? colors.coral700 : colors.ink500,
              }}
            >
              {step}
              {i === 0 ? ' ✓' : ''}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 24 }}>
        <View>
          <Text style={{ fontSize: 30, fontFamily: fonts.display, color: colors.ink900, letterSpacing: -1 }}>
            Tell us about your restaurant
          </Text>
          <Text style={{ fontSize: 15, color: colors.ink700, fontFamily: fonts.body, marginTop: 6 }}>
            This shows on your QR menu, bills and invoices.
          </Text>
        </View>

        <TextField label="Restaurant name" value={name} onChangeText={setName} placeholder="e.g. Spice Route" autoCapitalize="words" />
        <TextField label="Your name" value={ownerName} onChangeText={setOwnerName} placeholder="e.g. Aarav Bhateja" autoCapitalize="words" />

        <TextField
          label="Create a password"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setPasswordError(null);
          }}
          placeholder="At least 8 characters"
          secureTextEntry
        />
        <TextField
          label="Confirm password"
          value={confirmPassword}
          onChangeText={(v) => {
            setConfirmPassword(v);
            setPasswordError(null);
          }}
          placeholder="Re-enter password"
          secureTextEntry
          error={passwordError ?? undefined}
        />
        <Text style={{ fontSize: 13, color: colors.ink500, fontFamily: fonts.body, marginTop: -8 }}>
          You&rsquo;ll use this to sign in next time — no code needed.
        </Text>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 14 }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Details</Text>
          <TextField label="Cuisine" value={cuisine} onChangeText={setCuisine} placeholder="e.g. North Indian, Rajasthani" autoCapitalize="words" />
          <TextField label="Restaurant address" value={address} onChangeText={setAddress} placeholder="Shop no., building, street" />
          <TextField label="City" value={city} onChangeText={setCity} placeholder="e.g. Bengaluru" autoCapitalize="words" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <TextField label="State" value={state} onChangeText={setState} placeholder="e.g. Karnataka" autoCapitalize="words" />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="PIN code" value={pincode} onChangeText={setPincode} placeholder="560001" keyboardType="numeric" />
            </View>
          </View>
          <TextField label="Phone number" value={phone} onChangeText={setPhone} placeholder="+91XXXXXXXXXX" keyboardType="phone-pad" />
          <TextField label="Email" value={email} onChangeText={setEmail} placeholder="restaurant@example.com" keyboardType="email-address" />
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
          <TextField label="GST rate (%)" value={gstPercent} onChangeText={setGstPercent} keyboardType="numeric" placeholder="5" />
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

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 14 }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Photos</Text>
          <Text style={{ fontSize: 12, color: colors.ink500, marginTop: -8 }}>Optional — add now or later from Settings.</Text>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ gap: 8 }}>
              <Pressable
                onPress={() => choosePhoto('logo')}
                disabled={pickingLogo}
                style={{ height: 96, width: 96, borderRadius: 22, borderWidth: 1.5, borderColor: logoAsset ? 'transparent' : '#E4D8D0', borderStyle: logoAsset ? 'solid' : 'dashed', backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
              >
                {pickingLogo ? (
                  <ActivityIndicator color={colors.coral600} />
                ) : logoAsset ? (
                  <Image source={{ uri: logoAsset.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <View style={{ alignItems: 'center', gap: 4 }}>
                    <Icon name="image" size={22} color={colors.ink500} />
                    <Text style={{ fontSize: 11, fontFamily: fonts.bodyBold, color: colors.ink700 }}>Logo</Text>
                  </View>
                )}
              </Pressable>
            </View>
            <View style={{ gap: 8, flex: 1 }}>
              <Pressable
                onPress={() => choosePhoto('cover')}
                disabled={pickingCover}
                style={{ height: 96, borderRadius: 22, borderWidth: 1.5, borderColor: coverAsset ? 'transparent' : '#E4D8D0', borderStyle: coverAsset ? 'solid' : 'dashed', backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
              >
                {pickingCover ? (
                  <ActivityIndicator color={colors.coral600} />
                ) : coverAsset ? (
                  <Image source={{ uri: coverAsset.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <View style={{ alignItems: 'center', gap: 4 }}>
                    <Icon name="image" size={22} color={colors.ink500} />
                    <Text style={{ fontSize: 11, fontFamily: fonts.bodyBold, color: colors.ink700 }}>Cover photo</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </View>

        {error ? <Text style={{ fontSize: 13, color: colors.error, fontFamily: fonts.bodyBold }}>{error}</Text> : null}

        <Text
          onPress={() => router.push('/accept-invite')}
          style={{ textAlign: 'center', fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink700 }}
        >
          Have an invite code instead?
        </Text>
      </ScrollView>

      <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, padding: 20, paddingBottom: 28 }}>
        <Button
          title={loading ? 'Creating...' : 'Continue to menu setup'}
          onPress={createRestaurant}
          disabled={password.length < MIN_PASSWORD_LENGTH || !confirmPassword || !!missingField || loading}
          loading={loading}
          style={{ height: 56, borderRadius: radius.pill }}
        />
      </View>
    </SafeAreaView>
  );
}
