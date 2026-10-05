import * as Clipboard from 'expo-clipboard';
import { useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import { buildOrderUrl } from '@/lib/orderUrl';
import { saveImageToGallery, shareImageUri } from '@/lib/shareImage';
import { colors, fonts, radius } from '@/theme/tokens';

import { Icon } from './Icon';

// Shown exactly once, right after a table's QR is (re)issued — the raw
// token that makes this URL work is never stored or retrievable again, so
// this is the only moment staff can capture or print it.
export function TableQrSheet({
  tableLabel,
  tenantSlug,
  rawToken,
  onClose,
}: {
  tableLabel: string;
  tenantSlug: string;
  rawToken: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const shotRef = useRef<ViewShotRef>(null);
  const url = buildOrderUrl(rawToken, tenantSlug, tableLabel);

  async function copyLink() {
    await Clipboard.setStringAsync(url);
    setCopied(true);
  }

  async function capture(): Promise<string> {
    if (!shotRef.current) throw new Error('Nothing to capture yet — try again.');
    return shotRef.current.capture();
  }

  async function share() {
    setSharing(true);
    try {
      const uri = await capture();
      await shareImageUri(uri, `${tableLabel}-qr.png`, `${tableLabel} QR code`);
    } catch (e) {
      Alert.alert('Could not share', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSharing(false);
    }
  }

  async function saveToGallery() {
    setSaving(true);
    try {
      const uri = await capture();
      const result = await saveImageToGallery(uri, `${tableLabel}-qr.png`);
      if (result === 'saved') Alert.alert('Saved', 'The QR code was saved to your photos.');
      else if (result === 'downloaded') Alert.alert('Downloaded', 'The QR code was downloaded.');
      else {
        Alert.alert('Permission needed', 'Allow photo library access to save the QR code.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings() },
        ]);
      }
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(27,23,22,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <View style={{ width: '100%', maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 28, padding: 22, gap: 16, alignItems: 'center' }}>
        <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>{tableLabel}&rsquo;s QR is ready</Text>
        <Text style={{ fontSize: 13, color: colors.ink700, textAlign: 'center' }}>
          Print this now — for security it can&rsquo;t be shown again. Reissuing a new one retires this code immediately.
        </Text>

        <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }} style={{ backgroundColor: '#FFFFFF' }}>
          <View style={{ padding: 20, alignItems: 'center', gap: 10 }}>
            <View style={{ padding: 16, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: colors.line }}>
              <QRCode value={url} size={200} color={colors.ink900} backgroundColor="#FFFFFF" />
            </View>
            <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{tableLabel}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12, color: colors.ink500, maxWidth: 280 }}>{url}</Text>
          </View>
        </ViewShot>

        <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
          <Pressable onPress={copyLink} style={{ flex: 1, height: 50, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <Icon name={copied ? 'check' : 'note'} size={16} color={colors.ink900} />
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900, fontSize: 13 }}>{copied ? 'Copied' : 'Copy'}</Text>
          </Pressable>
          <Pressable disabled={sharing} onPress={share} style={{ flex: 1, height: 50, borderRadius: radius.pill, backgroundColor: colors.coral600, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: sharing ? 0.6 : 1 }}>
            <Icon name="share" size={16} color="#FFFFFF" />
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF', fontSize: 13 }}>{sharing ? '…' : 'Share'}</Text>
          </Pressable>
          <Pressable disabled={saving} onPress={saveToGallery} style={{ flex: 1, height: 50, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: saving ? 0.6 : 1 }}>
            <Icon name="download" size={16} color={colors.ink900} />
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900, fontSize: 13 }}>{saving ? '…' : Platform.OS === 'web' ? 'Download' : 'Save'}</Text>
          </Pressable>
        </View>

        <Pressable onPress={onClose} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink700 }}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}
