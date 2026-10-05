import { Redirect } from 'expo-router';

import { BrandSplash } from '@/components/BrandSplash';
import { useAuth } from '@/hooks/useAuth';
import { homePathForRole } from '@/lib/roleHome';

export default function Index() {
  const { session, membership, memberships, loading } = useAuth();

  if (loading) {
    return <BrandSplash />;
  }

  if (!session) return <Redirect href="/welcome" />;
  if (!membership) {
    // Several restaurants but none actively selected yet (e.g. right after
    // a fresh sign-in) vs. genuinely no restaurant at all.
    if (memberships.length > 1) return <Redirect href="/select-restaurant" />;
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href={homePathForRole(membership.roleName)} />;
}
