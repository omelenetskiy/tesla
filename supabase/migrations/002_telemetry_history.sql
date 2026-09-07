create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'UTC',
  distance_unit text not null default 'mi' check (distance_unit in ('mi', 'km')),
  temperature_unit text not null default 'C' check (temperature_unit in ('C', 'F')),
  location_history_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.battery_snapshots (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  battery_level numeric(5, 2),
  battery_range numeric(10, 2),
  charging_state text,
  charge_energy_added numeric(10, 3),
  collected_at timestamptz not null default now(),
  provider_updated_at timestamptz
);

create table if not exists public.vehicle_locations (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  accuracy numeric(10, 2),
  source text not null default 'owner_api',
  recorded_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  start_latitude numeric(9, 6),
  start_longitude numeric(9, 6),
  end_latitude numeric(9, 6),
  end_longitude numeric(9, 6),
  distance numeric(10, 3),
  duration_seconds integer,
  battery_start numeric(5, 2),
  battery_end numeric(5, 2),
  energy_used numeric(10, 3),
  source text not null default 'owner_api',
  created_at timestamptz not null default now(),
  unique (vehicle_id, started_at)
);

create table if not exists public.charging_sessions (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  location text,
  charger_type text,
  battery_start numeric(5, 2),
  battery_end numeric(5, 2),
  energy_added numeric(10, 3),
  peak_power numeric(10, 3),
  cost numeric(10, 2),
  source text not null default 'owner_api',
  created_at timestamptz not null default now(),
  unique (vehicle_id, started_at)
);

create index if not exists battery_snapshots_vehicle_time_idx
  on public.battery_snapshots (vehicle_id, collected_at desc);

create index if not exists vehicle_locations_vehicle_time_idx
  on public.vehicle_locations (vehicle_id, recorded_at desc);

create index if not exists trips_vehicle_time_idx
  on public.trips (vehicle_id, started_at desc);

create index if not exists charging_sessions_vehicle_time_idx
  on public.charging_sessions (vehicle_id, started_at desc);

alter table public.user_settings enable row level security;
alter table public.battery_snapshots enable row level security;
alter table public.vehicle_locations enable row level security;
alter table public.trips enable row level security;
alter table public.charging_sessions enable row level security;

create policy "owners manage settings"
  on public.user_settings for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "owners read battery snapshots"
  on public.battery_snapshots for select to authenticated
  using (exists (
    select 1 from public.vehicles v
    where v.id = vehicle_id and v.owner_id = auth.uid()
  ));

create policy "owners read vehicle locations"
  on public.vehicle_locations for select to authenticated
  using (exists (
    select 1 from public.vehicles v
    where v.id = vehicle_id
      and v.owner_id = auth.uid()
      and exists (
        select 1 from public.user_settings s
        where s.user_id = auth.uid() and s.location_history_enabled = true
      )
  ));

create policy "owners read trips"
  on public.trips for select to authenticated
  using (exists (
    select 1 from public.vehicles v
    where v.id = vehicle_id and v.owner_id = auth.uid()
  ));

create policy "owners read charging sessions"
  on public.charging_sessions for select to authenticated
  using (exists (
    select 1 from public.vehicles v
    where v.id = vehicle_id and v.owner_id = auth.uid()
  ));
