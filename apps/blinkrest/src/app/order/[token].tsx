import { useLocalSearchParams } from 'expo-router';

import { PublicOrderScreen } from '@/components/PublicOrderScreen';

// Legacy URL shape, kept working for any QR codes already printed with it.
// New QR codes use /r/[slug]/[table]?k=<token> instead (see TableQrSheet).
export default function PublicOrder() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <PublicOrderScreen token={token} />;
}
