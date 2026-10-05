-- Tables/QR, menu categories/items, variants and add-ons. All tenant-scoped.
-- No branch_id in MVP per decision; add nullable branch_id later without touching history.

create table public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  label text not null,
  capacity int,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  unique (tenant_id, label)
);

create index restaurant_tables_tenant_id_idx on public.restaurant_tables (tenant_id);

-- public_token_hash is what the QR URL resolves through; never expose the raw token
-- anywhere but the moment it's generated (printed QR / NFC write).
create table public.qr_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  table_id uuid not null references public.restaurant_tables (id) on delete cascade,
  public_token_hash text not null unique,
  asset_type text not null default 'qr' check (asset_type in ('qr', 'nfc')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now()
);

create index qr_assets_tenant_id_idx on public.qr_assets (tenant_id);
create index qr_assets_table_id_idx on public.qr_assets (table_id);

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index menu_categories_tenant_id_idx on public.menu_categories (tenant_id);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category_id uuid not null references public.menu_categories (id) on delete cascade,
  name text not null,
  description text,
  price_minor bigint not null,
  currency text not null default 'INR',
  image_path text,
  dietary_labels text[] not null default '{}',
  tax_code text,
  sort_order int not null default 0,
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);

create index menu_items_tenant_id_idx on public.menu_items (tenant_id);
create index menu_items_category_id_idx on public.menu_items (category_id);

-- Option groups (e.g. "Size") and their priced options (e.g. "Large +Rs 50").
create table public.item_variant_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  menu_item_id uuid not null references public.menu_items (id) on delete cascade,
  name text not null,
  is_required boolean not null default false,
  sort_order int not null default 0
);

create table public.item_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  group_id uuid not null references public.item_variant_groups (id) on delete cascade,
  name text not null,
  price_delta_minor bigint not null default 0,
  is_available boolean not null default true,
  sort_order int not null default 0
);

create table public.item_addon_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  menu_item_id uuid not null references public.menu_items (id) on delete cascade,
  name text not null,
  max_selections int, -- null = unlimited
  sort_order int not null default 0
);

create table public.item_addons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  group_id uuid not null references public.item_addon_groups (id) on delete cascade,
  name text not null,
  price_delta_minor bigint not null default 0,
  is_available boolean not null default true,
  sort_order int not null default 0
);

create index item_variant_groups_menu_item_id_idx on public.item_variant_groups (menu_item_id);
create index item_variants_group_id_idx on public.item_variants (group_id);
create index item_addon_groups_menu_item_id_idx on public.item_addon_groups (menu_item_id);
create index item_addons_group_id_idx on public.item_addons (group_id);
