-- A banner/cover photo for the customer-facing QR menu header, distinct
-- from the small square logo.
alter table public.tenants add column if not exists cover_image_path text;
