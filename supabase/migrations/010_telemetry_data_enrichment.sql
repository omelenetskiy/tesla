-- 010_telemetry_data_enrichment.sql
-- Forward-only migration to support Phase 2 (reliable telemetry)
-- Plan §2, §28: Add session samples, daily aggregates, field freshness, checkpoints
-- SAFE: Uses IF NOT EXISTS on all tables, never drops or destroys existing data
-- Applied: 2026-09-14 (after Phase 1 approval)

-- ──────────────────────────────────────────────────────────────────
-- Session samples: raw per-field measurements during active sessions
-- ──────────────────────────────────────────────────────────────────
-- Stores individual field observations (battery_level, speed_kmh, etc.)
-- during trips, charging sessions, and parked periods for granular analysis.
create table if not exists public.telemetry_session_samples (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,  -- trip_id or charging_session_id
  session_type text not null check (session_type in ('trip', 'charging', 'parked')),
  field_name text not null,  -- 'battery_level', 'speed_kmh', 'power_kw', etc.
  numeric_value numeric,
  text_value text,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (vehicle_id, session_id, field_name, observed_at)
);

comment on table public.telemetry_session_samples is 'Raw per-field measurements (§28). One row per field per observation time.';
comment on column public.telemetry_session_samples.session_id is 'Identifier for the session; usually trip_id or charging_session_id.';
comment on column public.telemetry_session_samples.session_type is 'Distinguishes active measurement context.';
comment on column public.telemetry_session_samples.observed_at is 'Time field was actually observed on vehicle; may differ from created_at.';

create index if not exists telemetry_session_samples_vehicle_time_idx
  on public.telemetry_session_samples (vehicle_id, observed_at desc);

create index if not exists telemetry_session_samples_session_idx
  on public.telemetry_session_samples (session_id, session_type);

create index if not exists telemetry_session_samples_field_idx
  on public.telemetry_session_samples (vehicle_id, field_name, observed_at desc);

-- ──────────────────────────────────────────────────────────────────
-- Daily aggregates: fast query source for dashboard/calendar
-- ──────────────────────────────────────────────────────────────────
-- Computed daily summaries keyed by vehicle and date, used for calendar heatmap,
-- statistics cards, and trend analysis. Populated by background job after daily
-- measurement collection completes.
create table if not exists public.telemetry_daily_aggregates (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  date date not null,

  -- Distance
  total_distance_km numeric(10,1),
  trip_count int default 0,

  -- Energy (separated by activity)
  energy_consumed_driving_kwh numeric(8,2),
  energy_consumed_parked_kwh numeric(8,2),
  energy_charged_kwh numeric(8,2),
  energy_regenerated_kwh numeric(8,2),

  -- Battery state transitions
  lowest_soc_percent numeric(5,1),
  highest_soc_percent numeric(5,1),

  -- Charging sessions on this day
  charging_session_count int default 0,
  total_charging_duration_minutes int,

  -- Trip metrics
  longest_trip_km numeric(10,1),
  max_speed_kmh numeric(6,1),
  avg_efficiency_wh_per_km numeric(5,1),

  -- Temperature
  min_inside_temp_c numeric(5,1),
  max_inside_temp_c numeric(5,1),
  min_outside_temp_c numeric(5,1),
  max_outside_temp_c numeric(5,1),

  -- Activity classification
  active_hours int default 0,  -- hours with movement or charging

  -- Data quality
  processing_status text check (processing_status in ('pending', 'processed', 'partial', 'error')) default 'pending',
  sample_count int default 0,
  coverage_percent numeric(5,1),  -- 0-100 percent of day with data

  -- Metadata
  last_updated_at timestamptz default now(),
  created_at timestamptz not null default now(),

  unique (vehicle_id, date)
);

comment on table public.telemetry_daily_aggregates is 'Pre-computed daily summaries for fast calendar/dashboard queries (§28).';
comment on column public.telemetry_daily_aggregates.date is 'Date in vehicle owner''s timezone (§5, calendar rules).';
comment on column public.telemetry_daily_aggregates.energy_consumed_driving_kwh is 'Energy spent by motors during motion.';
comment on column public.telemetry_daily_aggregates.energy_consumed_parked_kwh is 'Energy spent by systems while stationary (climate, Sentry, etc.).';
comment on column public.telemetry_daily_aggregates.processing_status is 'NULL or pending: still being computed; processed: ready; partial: incomplete data for day; error: derivation failed.';
comment on column public.telemetry_daily_aggregates.coverage_percent is 'Percentage of 24-hour period with valid measurements (§5, freshness).';

create index if not exists telemetry_daily_aggregates_vehicle_date_idx
  on public.telemetry_daily_aggregates (vehicle_id, date desc);

create index if not exists telemetry_daily_aggregates_status_idx
  on public.telemetry_daily_aggregates (processing_status, created_at desc)
  where processing_status is null;

-- ──────────────────────────────────────────────────────────────────
-- Field freshness: per-field measurement staleness tracking
-- ──────────────────────────────────────────────────────────────────
-- Tracks when each field (battery_level, speed_kmh, etc.) was last observed
-- on each vehicle. Allows UI to label fields by freshness and determine
-- which fields are unavailable vs. simply stale (§2, §48, §56).
create table if not exists public.telemetry_field_freshness (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  field_name text not null,
  last_observed_at timestamptz,
  last_update_at timestamptz default now(),
  reception_count int default 1,
  unavailable_since timestamptz,  -- when we gave up seeing this field (§2, §49)
  unique (vehicle_id, field_name)
);

comment on table public.telemetry_field_freshness is 'Per-vehicle, per-field last-observed timestamps (§2, §48).';
comment on column public.telemetry_field_freshness.last_observed_at is 'When this field was last received from the vehicle.';
comment on column public.telemetry_field_freshness.unavailable_since is 'If set, indicates field has stopped arriving; null = field is normally received.';

create index if not exists telemetry_field_freshness_vehicle_idx
  on public.telemetry_field_freshness (vehicle_id);

create index if not exists telemetry_field_freshness_unavailable_idx
  on public.telemetry_field_freshness (vehicle_id, unavailable_since desc)
  where unavailable_since is not null;

-- ──────────────────────────────────────────────────────────────────
-- Processing checkpoints: resume ingestion from last known good state
-- ──────────────────────────────────────────────────────────────────
-- Persistent state for the ingestion loop to ensure idempotency and
-- fast resumption after crashes or manual restarts (§2, §44, §45).
-- Replaces the need for 30-day full history reconstruction.
create table if not exists public.telemetry_ingest_checkpoints (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  checkpoint_type text not null check (checkpoint_type in ('fleet_event', 'session_open', 'aggregation', 'reindex')),
  checkpoint_key text not null,  -- e.g., 'txid_12345' or 'session_charging_2026-09-14'
  checkpoint_state jsonb not null default '{}'::jsonb,  -- last_processed_txid, open_session_id, next_date_to_aggregate, etc.
  processed_at timestamptz not null default now(),
  unique (vehicle_id, checkpoint_type, checkpoint_key)
);

comment on table public.telemetry_ingest_checkpoints is 'Resumption state for idempotent, replayable collection (§2, §44, §45).';
comment on column public.telemetry_ingest_checkpoints.checkpoint_type is 'Type of checkpoint: fleet_event (last processed txid), session_open (active trip/charge), aggregation (last computed day).';
comment on column public.telemetry_ingest_checkpoints.checkpoint_key is 'Unique key within vehicle for this checkpoint type.';
comment on column public.telemetry_ingest_checkpoints.checkpoint_state is 'Serialized state payload: {last_processed_txid, open_session_id, session_start_time, etc}.';

create index if not exists telemetry_ingest_checkpoints_vehicle_idx
  on public.telemetry_ingest_checkpoints (vehicle_id, checkpoint_type);

create index if not exists telemetry_ingest_checkpoints_time_idx
  on public.telemetry_ingest_checkpoints (vehicle_id, processed_at desc);

-- ──────────────────────────────────────────────────────────────────
-- Open session state: actively tracked trips and charging sessions
-- ──────────────────────────────────────────────────────────────────
-- Records the current open trip or charging session for each vehicle,
-- allowing ingestion restart to resume collection without losing data
-- between process restarts (§2, §44, §45).
create table if not exists public.telemetry_open_sessions (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_type text not null check (session_type in ('trip', 'charging')),
  session_id text not null,
  started_at timestamptz not null,
  last_update_at timestamptz default now(),
  state jsonb not null default '{}'::jsonb,  -- {start_soc, start_odometer, samples_count, last_speed, etc.}
  unique (vehicle_id, session_type)
);

comment on table public.telemetry_open_sessions is 'In-flight trip and charging session state for idempotent restart (§2, §44).';
comment on column public.telemetry_open_sessions.state is 'Reconstructable fields: start_soc, start_odometer, sample_count, route_points, last_power, etc.';

create index if not exists telemetry_open_sessions_vehicle_idx
  on public.telemetry_open_sessions (vehicle_id, session_type);

-- ──────────────────────────────────────────────────────────────────
-- Measurement coverage: aggregated statistics for retention planning
-- ──────────────────────────────────────────────────────────────────
-- High-level stats to drive retention policies: how much data is being
-- produced, which fields are being received, what's the DB growth rate.
create table if not exists public.telemetry_coverage_stats (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  measurement_date date not null,  -- the date whose data this stats row covers

  -- Volume
  session_sample_count int default 0,
  fleet_event_count int default 0,

  -- Fields observed (comma-separated or JSON array of received field names)
  received_fields jsonb default '[]'::jsonb,
  unavailable_fields jsonb default '[]'::jsonb,

  -- Timing
  earliest_observation_at timestamptz,
  latest_observation_at timestamptz,

  -- Data quality
  duplicate_event_count int default 0,
  out_of_order_event_count int default 0,

  created_at timestamptz not null default now(),

  unique (vehicle_id, measurement_date)
);

comment on table public.telemetry_coverage_stats is 'Per-vehicle, per-day measurement volume and quality metrics (§2, retention planning).';

create index if not exists telemetry_coverage_stats_vehicle_date_idx
  on public.telemetry_coverage_stats (vehicle_id, measurement_date desc);

-- ──────────────────────────────────────────────────────────────────
-- Enable RLS on all new tables
-- ──────────────────────────────────────────────────────────────────
alter table public.telemetry_session_samples enable row level security;
alter table public.telemetry_daily_aggregates enable row level security;
alter table public.telemetry_field_freshness enable row level security;
alter table public.telemetry_ingest_checkpoints enable row level security;
alter table public.telemetry_open_sessions enable row level security;
alter table public.telemetry_coverage_stats enable row level security;

-- ──────────────────────────────────────────────────────────────────
-- RLS Policies: owners can read their own vehicle data
-- ──────────────────────────────────────────────────────────────────
drop policy if exists "owners read telemetry samples" on public.telemetry_session_samples;
create policy "owners read telemetry samples"
  on public.telemetry_session_samples
  for select to authenticated
  using (owner_id = auth.uid() or exists (
    select 1 from public.vehicles v where v.id = telemetry_session_samples.vehicle_id and v.owner_id = auth.uid()
  ));

drop policy if exists "system insert telemetry samples" on public.telemetry_session_samples;
create policy "system insert telemetry samples"
  on public.telemetry_session_samples
  for insert to authenticated, service_role
  with check (true);

drop policy if exists "owners read daily aggregates" on public.telemetry_daily_aggregates;
create policy "owners read daily aggregates"
  on public.telemetry_daily_aggregates
  for select to authenticated
  using (owner_id = auth.uid() or exists (
    select 1 from public.vehicles v where v.id = telemetry_daily_aggregates.vehicle_id and v.owner_id = auth.uid()
  ));

drop policy if exists "system write daily aggregates" on public.telemetry_daily_aggregates;
create policy "system write daily aggregates"
  on public.telemetry_daily_aggregates
  for insert to authenticated, service_role
  with check (true);

drop policy if exists "system update daily aggregates" on public.telemetry_daily_aggregates;
create policy "system update daily aggregates"
  on public.telemetry_daily_aggregates
  for update to authenticated, service_role
  using (true)
  with check (true);

drop policy if exists "owners read field freshness" on public.telemetry_field_freshness;
create policy "owners read field freshness"
  on public.telemetry_field_freshness
  for select to authenticated
  using (exists (
    select 1 from public.vehicles v where v.id = telemetry_field_freshness.vehicle_id and v.owner_id = auth.uid()
  ));

drop policy if exists "system write field freshness" on public.telemetry_field_freshness;
create policy "system write field freshness"
  on public.telemetry_field_freshness
  for insert to authenticated, service_role
  with check (true);

drop policy if exists "system update field freshness" on public.telemetry_field_freshness;
create policy "system update field freshness"
  on public.telemetry_field_freshness
  for update to authenticated, service_role
  using (true)
  with check (true);

drop policy if exists "owners read checkpoints" on public.telemetry_ingest_checkpoints;
create policy "owners read checkpoints"
  on public.telemetry_ingest_checkpoints
  for select to authenticated
  using (exists (
    select 1 from public.vehicles v where v.id = telemetry_ingest_checkpoints.vehicle_id and v.owner_id = auth.uid()
  ));

drop policy if exists "system manage checkpoints" on public.telemetry_ingest_checkpoints;
create policy "system manage checkpoints"
  on public.telemetry_ingest_checkpoints
  for all to authenticated, service_role
  using (true)
  with check (true);

drop policy if exists "owners read open sessions" on public.telemetry_open_sessions;
create policy "owners read open sessions"
  on public.telemetry_open_sessions
  for select to authenticated
  using (owner_id = auth.uid() or exists (
    select 1 from public.vehicles v where v.id = telemetry_open_sessions.vehicle_id and v.owner_id = auth.uid()
  ));

drop policy if exists "system manage open sessions" on public.telemetry_open_sessions;
create policy "system manage open sessions"
  on public.telemetry_open_sessions
  for all to authenticated, service_role
  using (true)
  with check (true);

drop policy if exists "owners read coverage stats" on public.telemetry_coverage_stats;
create policy "owners read coverage stats"
  on public.telemetry_coverage_stats
  for select to authenticated
  using (owner_id = auth.uid() or exists (
    select 1 from public.vehicles v where v.id = telemetry_coverage_stats.vehicle_id and v.owner_id = auth.uid()
  ));

drop policy if exists "system write coverage stats" on public.telemetry_coverage_stats;
create policy "system write coverage stats"
  on public.telemetry_coverage_stats
  for insert to authenticated, service_role
  with check (true);

drop policy if exists "system update coverage stats" on public.telemetry_coverage_stats;
create policy "system update coverage stats"
  on public.telemetry_coverage_stats
  for update to authenticated, service_role
  using (true)
  with check (true);

-- ──────────────────────────────────────────────────────────────────
-- Server-side functions for secure, idempotent inserts
-- ──────────────────────────────────────────────────────────────────

-- Record a single telemetry sample (called per field per observation time)
create or replace function public.record_telemetry_sample(
  vehicle_id_param uuid,
  owner_id_param uuid,
  session_id text,
  session_type text,
  field_name text,
  numeric_value numeric default null,
  text_value text default null,
  observed_at_param timestamptz default now()
)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into public.telemetry_session_samples (
    vehicle_id, owner_id, session_id, session_type, field_name, numeric_value, text_value, observed_at
  ) values (vehicle_id_param, owner_id_param, session_id, session_type, field_name, numeric_value, text_value, observed_at_param)
  on conflict (vehicle_id, session_id, field_name, observed_at)
  do update set numeric_value = excluded.numeric_value, text_value = excluded.text_value
  returning id;
$$;

grant execute on function public.record_telemetry_sample(uuid, uuid, text, text, text, numeric, text, timestamptz) to authenticated, service_role;

-- Update field freshness atomically
create or replace function public.update_field_freshness(
  vehicle_id_param uuid,
  field_name text,
  observed_at_param timestamptz default now()
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.telemetry_field_freshness (vehicle_id, field_name, last_observed_at)
  values (vehicle_id_param, field_name, observed_at_param)
  on conflict (vehicle_id, field_name)
  do update set
    last_observed_at = excluded.last_observed_at,
    last_update_at = now(),
    reception_count = telemetry_field_freshness.reception_count + 1,
    unavailable_since = null;  -- field is alive again
$$;

grant execute on function public.update_field_freshness(uuid, text, timestamptz) to authenticated, service_role;

-- Upsert checkpoint (idempotent)
create or replace function public.upsert_ingest_checkpoint(
  vehicle_id_param uuid,
  checkpoint_type text,
  checkpoint_key text,
  checkpoint_state jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.telemetry_ingest_checkpoints (vehicle_id, checkpoint_type, checkpoint_key, checkpoint_state)
  values (vehicle_id_param, checkpoint_type, checkpoint_key, checkpoint_state)
  on conflict (vehicle_id, checkpoint_type, checkpoint_key)
  do update set
    checkpoint_state = excluded.checkpoint_state,
    processed_at = now();
$$;

grant execute on function public.upsert_ingest_checkpoint(uuid, text, text, jsonb) to authenticated, service_role;

-- Query daily aggregate or null if not yet processed
create or replace function public.get_daily_aggregate(
  vehicle_id_param uuid,
  date_param date
)
returns table (
  id bigint,
  total_distance_km numeric,
  trip_count int,
  energy_consumed_kwh numeric,
  energy_charged_kwh numeric,
  charging_session_count int,
  processing_status text
)
language sql
security definer
set search_path = public
as $$
  select
    id, total_distance_km, trip_count,
    (energy_consumed_driving_kwh + coalesce(energy_consumed_parked_kwh, 0)) as energy_consumed_kwh,
    energy_charged_kwh, charging_session_count, processing_status
  from public.telemetry_daily_aggregates
  where vehicle_id = vehicle_id_param and date = date_param;
$$;

grant execute on function public.get_daily_aggregate(uuid, date) to authenticated, service_role;

notify pgrst, 'reload schema';


