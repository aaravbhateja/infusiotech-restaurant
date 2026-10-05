import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/tokens';

// A super admin is not a tenant_membership at all — it's a platform-level
// flag on the user row, checked server-side by is_super_admin() on every
// admin_* RPC. This layout is just the client-side routing gate; the real
// enforcement lives in Postgres, so a client bug here can't leak tenant data.
export default function AdminLayout() {
  const { session, loading: authLoading } = useAuth();
  const [checked, setChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!session) {
        if (!cancelled) {
          setIsAdmin(false);
          setChecked(true);
        }
        return;
      }
      const { data } = await supabase.rpc('is_super_admin');
      if (!cancelled) {
        setIsAdmin(!!data);
        setChecked(true);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (authLoading || !checked) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  if (!session || !isAdmin) return <Redirect href="/admin-login" />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="tenants/[id]" />
      <Stack.Screen name="support" />
    </Stack>
  );
}
