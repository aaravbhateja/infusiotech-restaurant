import { useLocalSearchParams } from 'expo-router';

import { PublicOrderScreen } from '@/components/PublicOrderScreen';

// The restaurant/table segments are purely cosmetic — a human can read what
// they're about to scan. The actual access control is the `k` query param,
// a one-time-shown random token the server resolves back to a tenant+table;
// nothing about the path alone grants access, so it can't be guessed.
export default function PublicOrderPretty() {
  const { k } = useLocalSearchParams<{ k: string }>();
  return <PublicOrderScreen token={k} />;
}
