-- Kitchen station routing: each dish can be tagged with which station
-- prepares it, so the kitchen screen can filter its ticket queue instead of
-- always showing every item to every cook.
alter table public.menu_items add column station text not null default 'general'
  check (station in ('general', 'tandoor', 'curry', 'wok', 'grill', 'dessert', 'beverage'));
