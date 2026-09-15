-- 011_history_schema_alignment.sql
-- Align legacy history tables with modern schema columns expected by app code.

-- Trips
alter table public.trips
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists energy_used numeric(10, 3),
  add column if not exists efficiency_wh_per_km numeric(7, 1),
  add column if not exists odometer_start_km numeric(11, 1),
  add column if not exists odometer_end_km numeric(11, 1),
  add column if not exists battery_start numeric(5, 2),
  add column if not exists battery_end numeric(5, 2),
  add column if not exists start_latitude double precision,
  add column if not exists start_longitude double precision,
  add column if not exists end_latitude double precision,
  add column if not exists end_longitude double precision,
  add column if not exists route jsonb not null default '[]'::jsonb,
  add column if not exists point_count integer not null default 0,
  add column if not exists name text,
  add column if not exists phase text,
  add column if not exists partial boolean not null default false,
  add column if not exists confidence text not null default 'snapshot_gap',
  add column if not exists dedupe_key text,
  add column if not exists updated_at timestamptz not null default now();

update public.trips
set
  started_at = coalesce(started_at, start_time),
  ended_at = coalesce(ended_at, end_time),
  energy_used = coalesce(energy_used, energy_used_kwh),
  route = case when route = '[]'::jsonb then coalesce(coordinates, '[]'::jsonb) else route end,
  point_count = case when point_count = 0 then coalesce(jsonb_array_length(coordinates), 0) else point_count end,
  battery_start = coalesce(battery_start, start_battery_percent),
  battery_end = coalesce(battery_end, end_battery_percent),
  start_latitude = coalesce(start_latitude, (start_location ->> 'latitude')::double precision),
  start_longitude = coalesce(start_longitude, (start_location ->> 'longitude')::double precision),
  end_latitude = coalesce(end_latitude, (end_location ->> 'latitude')::double precision),
  end_longitude = coalesce(end_longitude, (end_location ->> 'longitude')::double precision),
  confidence = coalesce(nullif(confidence, ''), case when coalesce(jsonb_array_length(coordinates), 0) > 1 then 'gps_route' else 'snapshot_gap' end),
  dedupe_key = coalesce(dedupe_key, 't:' || coalesce(started_at, start_time)::text),
  updated_at = now()
where
  started_at is null
  or ended_at is null
  or route = '[]'::jsonb
  or dedupe_key is null
  or battery_start is null
  or battery_end is null
  or start_latitude is null
  or start_longitude is null
  or end_latitude is null
  or end_longitude is null;

create unique index if not exists trips_vehicle_dedupe_uidx
  on public.trips (vehicle_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists trips_vehicle_started_at_idx
  on public.trips (vehicle_id, started_at desc);

-- Charging sessions
alter table public.charging_sessions
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists energy_added numeric(10, 3),
  add column if not exists added_range_km numeric(7, 1),
  add column if not exists peak_power numeric(10, 3),
  add column if not exists peak_power_kw numeric(7, 2),
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_label text,
  add column if not exists fast_charger boolean,
  add column if not exists completed boolean not null default false,
  add column if not exists confidence text not null default 'snapshot_gap',
  add column if not exists dedupe_key text,
  add column if not exists updated_at timestamptz not null default now();

update public.charging_sessions
set
  started_at = coalesce(started_at, start_time),
  ended_at = coalesce(ended_at, end_time),
  energy_added = coalesce(energy_added, energy_added_kwh),
  peak_power = coalesce(peak_power, max_power_kw),
  peak_power_kw = coalesce(peak_power_kw, max_power_kw),
  location_label = coalesce(location_label, location::text),
  completed = coalesce(completed, end_time is not null),
  dedupe_key = coalesce(dedupe_key, 'c:' || coalesce(started_at, start_time)::text),
  updated_at = now()
where
  started_at is null
  or ended_at is null
  or energy_added is null
  or dedupe_key is null;

create unique index if not exists charging_sessions_vehicle_dedupe_uidx
  on public.charging_sessions (vehicle_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists charging_sessions_vehicle_started_at_idx
  on public.charging_sessions (vehicle_id, started_at desc);

-- Battery snapshots
alter table public.battery_snapshots
  add column if not exists collected_at timestamptz,
  add column if not exists battery_level numeric(5, 2),
  add column if not exists usable_battery_level numeric(5, 2),
  add column if not exists battery_range numeric(10, 2),
  add column if not exists charging_state text,
  add column if not exists charge_energy_added numeric(10, 3),
  add column if not exists presence text,
  add column if not exists odometer_km numeric(11, 1),
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists partial boolean not null default false,
  add column if not exists dedupe_key text;

update public.battery_snapshots
set
  collected_at = coalesce(collected_at, timestamp),
  battery_level = coalesce(battery_level, state_of_charge_percent),
  usable_battery_level = coalesce(usable_battery_level, usable_range_km),
  battery_range = coalesce(battery_range, rated_range_km),
  dedupe_key = coalesce(dedupe_key, 's:' || coalesce(collected_at, timestamp)::text)
where
  collected_at is null
  or battery_level is null
  or dedupe_key is null;

create unique index if not exists battery_snapshots_vehicle_dedupe_uidx
  on public.battery_snapshots (vehicle_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists battery_snapshots_vehicle_collected_at_idx
  on public.battery_snapshots (vehicle_id, collected_at desc);

notify pgrst, 'reload schema';
