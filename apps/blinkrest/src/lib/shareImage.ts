import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

// expo-sharing's web shim passes the uri straight to `navigator.share({url})`,
// which only works for real web URLs — not the blob/data uri a captured
// image produces — so web needs its own path using the Files variant of the
// Web Share API, with a plain download as the fallback when that's
// unavailable (e.g. desktop Chrome without a share target).
export async function shareImageUri(uri: string, filename: string, dialogTitle?: string) {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type || 'image/png' });
    const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: dialogTitle });
      return;
    }
    downloadUri(uri, filename);
    return;
  }

  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { dialogTitle, mimeType: 'image/png', UTI: 'public.png' });
}

function downloadUri(uri: string, filename: string) {
  const a = document.createElement('a');
  a.href = uri;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export type SaveResult = 'saved' | 'downloaded' | 'denied';

// There's no OS photo gallery on web — a browser download is the closest
// equivalent, so that's what "Save" does there. expo-media-library's
// modern Asset/Album/Query classes extend a native-only base class that is
// undefined on web, so even just importing the module at the top level
// crashes web rendering ("Class extends value undefined") — it must stay a
// dynamic import that's never reached on the web branch below.
export async function saveImageToGallery(uri: string, filename: string): Promise<SaveResult> {
  if (Platform.OS === 'web') {
    downloadUri(uri, filename);
    return 'downloaded';
  }
  const MediaLibrary = await import('expo-media-library');
  const perm = await MediaLibrary.requestPermissionsAsync(true); // write-only — never reads the user's existing photos
  if (!perm.granted) return 'denied';
  await MediaLibrary.Asset.create(uri);
  return 'saved';
}
