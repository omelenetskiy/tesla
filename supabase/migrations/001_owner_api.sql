create extension if not exists pgcrypto;

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider_vehicle_id text not null,
  display_name text not null,
  model text,
  collection_mode text not null default 'passive' check (collection_mode in ('passive', 'conservative', 'on_demand')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_id, provider_vehicle_id)
);

create table if not exists public.vehicle_credentials (
  vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  access_token_ciphertext text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_states (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  provider_vehicle_id text not null,
  state jsonb not null,
  provider_updated_at timestamptz,
  collected_at timestamptz not null default now()
);

create index if not exists vehicle_states_vehicle_time_idx on public.vehicle_states (vehicle_id, collected_at desc);

create table if not exists public.collection_events (
  id bigint generated always as identity primary key,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  outcome text not null check (outcome in ('skipped', 'success', 'failed')),
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.vehicles enable row level security;
alter table public.vehicle_credentials enable row level security;
alter table public.vehicle_states enable row level security;
alter table public.collection_events enable row level security;

create policy "owners manage vehicles" on public.vehicles for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners read states" on public.vehicle_states for select to authenticated using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = auth.uid()));
create policy "owners read collection events" on public.collection_events for select to authenticated using (owner_id = auth.uid());
