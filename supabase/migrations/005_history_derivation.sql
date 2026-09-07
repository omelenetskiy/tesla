-- 005_history_derivation.sql
-- Apply AFTER 002, 003 and 004.
--
-- Why this file exists: trips and charging_sessions were declared in 002 but never
-- written. app/api/history recomputed them in JavaScript from up to 5000 snapshot
-- rows on every request (plan F4), which is slow, non-idempotent, and loses the
-- distinction between a measured route and an odometer guess. Derivation moves to
-- the collector, which persists once; these columns carry what the collector knows.

-- ── Trips: metric columns + measurement provenance ─────────────────────────
-- 002's `distance` has no unit and is fed from an odometer that may be miles.
-- New columns are explicitly metric; the old ones are retained for rollback only.
alter table public.trips
  add column if not exists distance_km numeric(10, 2),
  add column if not exists duration_minutes integer,
  add column if not exists average_speed_kmh numeric(6, 1),
  add column if not exists max_speed_kmh numeric(6, 1),
  add column if not exists energy_used_kwh numeric(10, 3),
  -- Wh per km. Positive = net consumed after regeneration.
  add column if not exists efficiency_wh_per_km numeric(7, 1),
  add column if not exists odometer_start_km numeric(11, 1),
  add column if not exists odometer_end_km numeric(11, 1),
  -- Ordered [lng, lat] pairs for the route map, kept small by design: one point per
  -- online snapshot during the trip, not per GPS sample.
  add column if not exists route jsonb not null default '[]'::jsonb,
  add column if not exists point_count integer not null default 0,
  add column if not exists name text,
  add column if not exists phase text check (phase in ('outbound', 'return_home', 'unknown')),
  -- True when the trip had no ending snapshot yet (car still moving / went offline).
  add column if not exists partial boolean not null default false,
  -- Honest provenance: what the numbers are actually based on.
  add column if not exists confidence text not null default 'snapshot_gap'
    check (confidence in ('gps_route', 'odometer_delta', 'snapshot_gap')),
  add column if not exists dedupe_key text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists trips_vehicle_dedupe_uidx
  on public.trips (vehicle_id, dedupe_key) where dedupe_key is not null;

-- ── Charging sessions ──────────────────────────────────────────────────────
alter table public.charging_sessions
  add column if not exists duration_minutes integer,
  add column if not exists average_power_kw numeric(7, 2),
  add column if not exists peak_power_kw numeric(7, 2),
  add column if not exists added_range_km numeric(7, 1),
  add column if not exists minutes_to_full integer,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_label text,
  add column if not exists fast_charger boolean,
  add column if not exists completed boolean not null default false,
  add column if not exists confidence text not null default 'snapshot_gap'
    check (confidence in ('gps_route', 'snapshot_gap')),
  add column if not exists dedupe_key text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists charging_sessions_vehicle_dedupe_uidx
  on public.charging_sessions (vehicle_id, dedupe_key) where dedupe_key is not null;

-- ── Battery history: metric + presence, queryable without jsonb traversal ─
alter table public.battery_snapshots
  add column if not exists usable_battery_level numeric(5, 2),
  add column if not exists rated_range_km numeric(7, 1),
  add column if not exists ideal_range_km numeric(7, 1),
  add column if not exists presence text check (presence in ('driving','parked','charging','sleeping','offline')),
  add column if not exists odometer_km numeric(11, 1),
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists charger_power_kw numeric(6, 1),
  -- Interpolated rows are marked, never silently averaged into a health figure.
  add column if not exists partial boolean not null default false,
  add column if not exists dedupe_key text;

create unique index if not exists battery_snapshots_vehicle_dedupe_uidx
  on public.battery_snapshots (vehicle_id, dedupe_key) where dedupe_key is not null;

-- ── Derived trip/charging analytics used by the Battery page ───────────────
-- Daily aggregates exist so §9's "daily energy usage" and any degradation figure are
-- computed from stored rows. A materialized view (not a table) keeps it refreshable
-- by the collector without a scheduler of its own.
create or replace view public.daily_energy_usage as
select
  bs.vehicle_id,
  (v.owner_id)::uuid as owner_id,
  date_trunc('day', bs.collected_at at time zone 'UTC')::date as day,
  min(bs.battery_level) as soc_min,
  max(bs.battery_level) as soc_max,
  max(bs.odometer_km) - min(bs.odometer_km) as distance_km,
  -- Net energy is only inferred where the provider reported it; otherwise NULL, so
  -- the UI shows "unavailable" instead of a fabricated consumption number.
  sum(case when bs.charging_state = 'Charging' then bs.charge_energy_added end) as charged_kwh
from public.battery_snapshots bs
join public.vehicles v on v.id = bs.vehicle_id
group by 1, 2, 3;

alter view public.daily_energy_usage owner to postgres;

create or replace function public.refresh_daily_energy_usage()
returns void language sql security definer set search_path = public as $$
  notify pgrst, 'reload schema';
$$;

-- Battery-health guard: §9 requires that degradation is shown only when there is a
-- real history to compute it from. This returns the row count of usable full-charge
-- references so the service can decide to hide the panel rather than extrapolate.
create or replace function public.battery_health_sample_count(p_vehicle_id uuid, p_days integer default 90)
returns integer
language sql
stable
security definer
set search_path = public as $$
  select count(*)::integer
  from public.battery_snapshots
  where vehicle_id = p_vehicle_id
    and collected_at > now() - make_interval(days => greatest(1, coalesce(p_days, 90)))
    and battery_level >= 95
$$;

revoke all on function public.battery_health_sample_count(uuid, integer) from public;
grant execute on function public.battery_health_sample_count(uuid, integer) to authenticated;

-- The collector upserts derived history idempotently; unique(vehicle_id, dedupe_key)
-- makes a re-run of the same window a no-op instead of a duplicate trip.
create or replace function public.upsert_trip(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.trips (
    vehicle_id, started_at, ended_at, distance_km, duration_minutes,
    average_speed_kmh, max_speed_kmh, energy_used_kwh, efficiency_wh_per_km,
    odometer_start_km, odometer_end_km, battery_start, battery_end,
    start_latitude, start_longitude, end_latitude, end_longitude,
    route, point_count, partial, confidence, dedupe_key, updated_at
  ) values (
    (p_payload->>'vehicle_id')::uuid, (p_payload->>'started_at')::timestamptz,
    (p_payload->>'ended_at')::timestamptz, (p_payload->>'distance_km')::numeric,
    (p_payload->>'duration_minutes')::integer, (p_payload->>'average_speed_kmh')::numeric,
    (p_payload->>'max_speed_kmh')::numeric, (p_payload->>'energy_used_kwh')::numeric,
    (p_payload->>'efficiency_wh_per_km')::numeric, (p_payload->>'odometer_start_km')::numeric,
    (p_payload->>'odometer_end_km')::numeric, (p_payload->>'battery_start')::numeric,
    (p_payload->>'battery_end')::numeric, (p_payload->>'start_latitude')::numeric,
    (p_payload->>'start_longitude')::numeric, (p_payload->>'end_latitude')::numeric,
    (p_payload->>'end_longitude')::numeric, coalesce(p_payload->'route', '[]'::jsonb),
    coalesce((p_payload->>'point_count')::integer, 0),
    coalesce((p_payload->>'partial')::boolean, false),
    coalesce(p_payload->>'confidence', 'snapshot_gap'), p_payload->>'dedupe_key', now()
  )
  on conflict (vehicle_id, dedupe_key) where dedupe_key is not null do update set
    ended_at = excluded.ended_at,
    distance_km = excluded.distance_km,
    duration_minutes = excluded.duration_minutes,
    average_speed_kmh = excluded.average_speed_kmh,
    max_speed_kmh = excluded.max_speed_kmh,
    energy_used_kwh = excluded.energy_used_kwh,
    efficiency_wh_per_km = excluded.efficiency_wh_per_km,
    battery_end = excluded.battery_end,
    end_latitude = excluded.end_latitude,
    end_longitude = excluded.end_longitude,
    route = excluded.route,
    point_count = excluded.point_count,
    partial = excluded.partial,
    confidence = excluded.confidence,
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.upsert_trip(jsonb) from public;
grant execute on function public.upsert_trip(jsonb) to service_role;

notify pgrst, 'reload schema';
