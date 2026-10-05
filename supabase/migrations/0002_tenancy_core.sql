-- Tenants, users, roles/permissions, memberships, staff invitations.
-- One active tenant_membership per user (MVP decision: no multi-tenant staff).

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  timezone text not null default 'Asia/Kolkata',
  contact_email text,
  contact_phone text,
  address text,
  logo_path text,
  brand_colors jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Mirrors auth.users; holds profile fields the app owns.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  phone text,
  phone_verified_at timestamptz,
  email text,
  email_verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- Role templates. tenant_id null = system template (Owner/Manager/Waiter/Cashier/Kitchen).
-- tenant_id set = owner-created custom role.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  name text not null,
  is_system_role boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

-- One active membership per user (enforced below with a partial unique index).
create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role_id uuid not null references public.roles (id),
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  invited_by uuid references public.users (id),
  joined_at timestamptz not null default now()
);

create unique index tenant_memberships_one_active_per_user
  on public.tenant_memberships (user_id)
  where status = 'active';

create index tenant_memberships_tenant_id_idx on public.tenant_memberships (tenant_id);

-- Owner-authorized grant/deny overrides on top of role defaults.
-- Owner-only keys (staff.manage, settings.manage, subscription.manage, ownership.transfer)
-- are protected in application logic / the has_permission() function, not here.
create table public.user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.tenant_memberships (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  effect text not null check (effect in ('grant', 'deny')),
  updated_by uuid references public.users (id),
  updated_at timestamptz not null default now(),
  unique (membership_id, permission_id)
);

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  contact text not null, -- phone number (E.164), matches staff login decision
  display_name text,
  role_id uuid not null references public.roles (id),
  token_hash text not null unique, -- never store the raw token
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

create index staff_invitations_tenant_id_idx on public.staff_invitations (tenant_id);

comment on table public.tenant_memberships is
  'MVP: exactly one active membership per user (see unique index). Revisit if multi-tenant staff is needed later.';
