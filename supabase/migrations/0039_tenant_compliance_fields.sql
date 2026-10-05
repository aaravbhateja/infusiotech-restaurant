-- Onboarding now collects FSSAI and GST registration numbers alongside the
-- other restaurant details, so they need somewhere to live. Both are plain
-- text (not validated server-side beyond non-empty) since format rules
-- change by state/authority and this app isn't the source of truth for them.
alter table public.tenants add column if not exists fssai_license text;
alter table public.tenants add column if not exists gstin text;
