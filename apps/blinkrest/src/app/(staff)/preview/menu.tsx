import { router } from 'expo-router';
import { View } from 'react-native';

import { PublicOrderScreen } from '@/components/PublicOrderScreen';
import { useAuth } from '@/hooks/useAuth';
import { colors } from '@/theme/tokens';

// What customers actually see when they scan a table's QR code — the real
// menu, the real prices, the real "accepting orders" state — reusing the
// exact same component, just scoped to the staff member's own tenant
// instead of a resolved table token, with checkout disabled.
export default function MenuPreview() {
  const { membership } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {membership ? <PublicOrderScreen token={undefined} previewTenantId={membership.tenantId} onBack={() => router.back()} /> : null}
    </View>
  );
}
