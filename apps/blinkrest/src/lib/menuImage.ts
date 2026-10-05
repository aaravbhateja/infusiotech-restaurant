import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

const BUCKET = 'menu-images';

export function menuImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Opens the device photo picker, uploads the chosen image to the tenant's
// folder in the public "menu-images" bucket, and returns the storage path to
// save on the menu item row (not the full URL — menuImageUrl() derives that
// on read, so rotating the bucket/CDN later doesn't require a data migration).
export async function pickAndUploadMenuImage(tenantId: string, aspect: [number, number] = [1, 1]): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library access is needed to add a dish photo.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect,
    quality: 0.7,
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const ext = asset.fileName?.split('.').pop()?.toLowerCase() || asset.uri.split('.').pop()?.split('?')[0] || 'jpg';
  const path = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const response = await fetch(asset.uri);
  const arrayBuffer = await response.arrayBuffer();
  const contentType = asset.mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, arrayBuffer, { contentType, upsert: true });
  if (error) throw error;

  return path;
}
