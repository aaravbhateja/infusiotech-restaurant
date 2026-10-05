-- Onboarding now collects a structured address (street line + city + state
-- + PIN code) instead of one free-text field, so city/state/pincode need
-- their own columns. `address` keeps holding the street/building line.
alter table public.tenants add column if not exists city text;
alter table public.tenants add column if not exists state text;
alter table public.tenants add column if not exists pincode text;
