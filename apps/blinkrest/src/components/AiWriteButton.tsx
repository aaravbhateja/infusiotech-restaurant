import { useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';

import { callAi } from '@/lib/ai';
import { colors, fonts, radius } from '@/theme/tokens';

export type AiCopy = { description: string; name_hi: string; description_hi: string };

// Drafts the English description and the Hindi name/description for a dish.
// The result only fills the form; nothing is saved until the owner saves.
export function AiWriteButton({ name, category, notes, onResult }: { name: string; category?: string; notes?: string; onResult: (copy: AiCopy) => void }) {
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!name.trim()) {
      Alert.alert('Enter the dish name first');
      return;
    }
    setBusy(true);
    const res = await callAi<AiCopy>({ mode: 'describe', name, category, notes });
    setBusy(false);
    if (!res.ok) {
      Alert.alert('AI writer', res.message);
      return;
    }
    onResult(res.data);
  }

  return (
    <Pressable
      onPress={run}
      disabled={busy}
      style={{ alignSelf: 'flex-start', height: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: '#F1EBFF', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}
    >
      <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: '#5B21B6' }}>{busy ? 'Writing...' : 'Write with AI (English + Hindi)'}</Text>
    </Pressable>
  );
}

export const aiHint = { fontSize: 12, color: colors.ink500 } as const;
