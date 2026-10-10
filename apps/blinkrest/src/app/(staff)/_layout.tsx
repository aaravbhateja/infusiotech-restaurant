import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { colors } from '@/theme/tokens';

export default function StaffLayout() {
  const { session, membership, loading } = useAuth();
  usePushNotifications(!!membership, membership?.tenantId);

  if (loading) return null;
  if (!session) return <Redirect href="/login" />;
  if (!membership) return <Redirect href="/onboarding" />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="home" options={{ animation: 'none' }} />
      <Stack.Screen name="orders" options={{ animation: 'none' }} />
      <Stack.Screen name="menu/index" options={{ animation: 'none' }} />
      <Stack.Screen name="menu/[id]" />
      <Stack.Screen name="menu/new" />
      <Stack.Screen name="menu/timings" />
      <Stack.Screen name="tables" options={{ animation: 'none' }} />
      <Stack.Screen name="more" options={{ animation: 'none' }} />
      <Stack.Screen name="orders/[id]" />
      <Stack.Screen name="orders/new" />
      <Stack.Screen name="staff/index" />
      <Stack.Screen name="staff/invite" />
      <Stack.Screen name="analytics" />
      <Stack.Screen name="waiter-home" options={{ animation: 'none' }} />
      <Stack.Screen name="kitchen-home" options={{ animation: 'none' }} />
      <Stack.Screen name="cashier-home" options={{ animation: 'none' }} />
      <Stack.Screen name="manager-home" options={{ animation: 'none' }} />
      <Stack.Screen name="customers/index" />
      <Stack.Screen name="customers/[id]" />
      <Stack.Screen name="preview/menu" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="offers/index" />
      <Stack.Screen name="offers/create" />
      <Stack.Screen name="cash" />
      <Stack.Screen name="kitchen-stats" />
      <Stack.Screen name="inventory" />
      <Stack.Screen name="reports" />
      <Stack.Screen name="roster" />
      <Stack.Screen name="insights" />
      <Stack.Screen name="growth" />
      <Stack.Screen name="payments/index" />
      <Stack.Screen name="payments/[id]" />
      <Stack.Screen name="reviews" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="settings/profile" />
      <Stack.Screen name="settings/orders" />
      <Stack.Screen name="settings/security" />
      <Stack.Screen name="settings/branding" options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
      <Stack.Screen name="settings/payments-kyc" />
      <Stack.Screen name="settings/delete-account" />
      <Stack.Screen name="staff/permissions" />
      <Stack.Screen name="staff/roles" />
      <Stack.Screen name="subscription" />
      <Stack.Screen name="support" />
      <Stack.Screen name="table/[id]" />
    </Stack>
  );
}
