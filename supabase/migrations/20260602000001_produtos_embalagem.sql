alter table public.produtos
  add column if not exists package_volume_liters numeric,
  add column if not exists units_per_box integer not null default 1;
