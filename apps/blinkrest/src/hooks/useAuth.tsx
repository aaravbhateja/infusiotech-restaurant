import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

type Membership = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  roleName: string;
  roleId: string;
  permissions: Set<string>;
};

// A lightweight row for every restaurant the user is active in — used by
// the restaurant switcher. Doesn't include permissions (those only make
// sense for whichever one is currently selected).
export type MembershipSummary = {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  roleName: string;
};

type AuthState = {
  session: Session | null;
  membership: Membership | null;
  memberships: MembershipSummary[];
  loading: boolean;
  // Returns the freshly-loaded membership (or null) directly, so callers can
  // branch on the result right away instead of re-reading the `membership`
  // closure value, which won't reflect the update until the next render.
  refreshMembership: () => Promise<Membership | null>;
  // Switches which restaurant this session acts as (server-validated —
  // never updates local state until Postgres confirms the membership is
  // real), then reloads the full membership for it.
  selectRestaurant: (tenantId: string) => Promise<Membership | null>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [memberships, setMemberships] = useState<MembershipSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadCurrentMembership(): Promise<Membership | null> {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setMembership(null);
      return null;
    }

    const { data: activeTenant } = await supabase.from('users').select('active_tenant_id').eq('id', userId).maybeSingle();
    if (!activeTenant?.active_tenant_id) {
      setMembership(null);
      return null;
    }

    const { data, error } = await supabase
      .from('tenant_memberships')
      .select('id, tenant_id, role_id, tenants(name, slug), roles(name)')
      .eq('user_id', userId)
      .eq('tenant_id', activeTenant.active_tenant_id)
      .eq('status', 'active')
      .maybeSingle();

    if (error || !data) {
      setMembership(null);
      return null;
    }

    const tenant = Array.isArray(data.tenants) ? data.tenants[0] : data.tenants;
    const role = Array.isArray(data.roles) ? data.roles[0] : data.roles;
    const { data: perms } = await supabase.rpc('my_permissions');

    const result: Membership = {
      id: data.id,
      tenantId: data.tenant_id,
      tenantName: tenant?.name ?? '',
      tenantSlug: tenant?.slug ?? '',
      roleName: role?.name ?? '',
      roleId: data.role_id,
      permissions: new Set((perms ?? []).map((p: { my_permissions: string } | string) => (typeof p === 'string' ? p : p.my_permissions))),
    };
    setMembership(result);
    return result;
  }

  // Loads the full restaurant list, auto-selects when there's exactly one
  // (or none yet picked but only one exists), and otherwise leaves
  // `membership` null so the app routes to the restaurant switcher.
  async function refreshMembership(): Promise<Membership | null> {
    const { data: rows } = await supabase.rpc('my_memberships');
    const list: MembershipSummary[] = (rows ?? []).map((r: any) => ({
      membershipId: r.membership_id,
      tenantId: r.tenant_id,
      tenantName: r.tenant_name,
      tenantSlug: r.tenant_slug,
      roleName: r.role_name,
    }));
    setMemberships(list);

    if (list.length === 0) {
      setMembership(null);
      return null;
    }

    const { data: userData } = await supabase.auth.getUser();
    const { data: activeTenant } = await supabase.from('users').select('active_tenant_id').eq('id', userData.user?.id).maybeSingle();
    const hasValidSelection = list.some((m) => m.tenantId === activeTenant?.active_tenant_id);

    if (!hasValidSelection) {
      if (list.length === 1) {
        await supabase.rpc('set_active_tenant', { p_tenant_id: list[0].tenantId });
      } else {
        setMembership(null);
        return null;
      }
    }

    return loadCurrentMembership();
  }

  async function selectRestaurant(tenantId: string): Promise<Membership | null> {
    const { error } = await supabase.rpc('set_active_tenant', { p_tenant_id: tenantId });
    if (error) return null;
    return loadCurrentMembership();
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await refreshMembership();
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        await refreshMembership();
      } else {
        setMembership(null);
        setMemberships([]);
      }
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally one-time listener setup
  }, []);

  return (
    <AuthContext.Provider value={{ session, membership, memberships, loading, refreshMembership, selectRestaurant }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
