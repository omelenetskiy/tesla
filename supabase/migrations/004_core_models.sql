-- 004_core_models.sql
-- Apply AFTER 001, 002 and 003. Order matters: this file extends tables that 001/002 create.
-- Plan §6: identifier split (E2), typed snapshot columns (F8), ActivityEvent, RequestLog (§23).

-- ── Vehicle identity: the short Owner API id vs the long cross-endpoint id ──
-- Requirement §44: `{id}` addresses state/command endpoints, `vehicle_id` addresses
-- streaming. The legacy single column stored whichever one the connect path happened
-- to write, which is how the live row ended up holding a 16-digit vehicle_id in a
-- slot that every state call uses as `{id}`.
alter table public.vehicles
  add column if not exists owner_api_id text,
  add column if not exists vehicle_id text,
  add column if not exists vin text,
  add column if not exists distance_unit text not null default 'km' check (distance_unit in ('km', 'mi')),
  add column if not exists polling_profile text not null default 'default' check (polling_profile in ('default', 'relaxed', 'passive')),
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_collected_at timestamptz;

comment on column public.vehicles.owner_api_id is 'Short Owner API id — the {id} path segment for /api/1/vehicles/{id}/...';
comment on column public.vehicles.vehicle_id is 'Long vehicle_id — streaming and cross-endpoint identity only. Never used as a path id.';

-- Backfill from the legacy column when it clearly holds a short id (<= 12 digits).
update public.vehicles
  set owner_api_id = provider_vehicle_id
  where owner_api_id is null and provider_vehicle_id ~ '^[0-9]{1,12}$';

-- Otherwise treat the legacy value as the long id and leave owner_api_id to be
-- reconciled from the next successful GET /api/1/vehicles (service.reconcileIdentities).
update public.vehicles
  set vehicle_id = provider_vehicle_id
  where vehicle_id is null and provider_vehicle_id ~ '^[0-9]{13,}$';

-- ── Credentials: region-aware refresh (§18) ────────────────────────────────
alter table public.vehicle_credentials
  add column if not exists auth_host text,
  add column if not exists region text check (region in ('global', 'china')),
  add column if not exists last_refreshed_at timestamptz,
  add column if not exists refresh_failed_at timestamptz,
  add column if not exists account_email text;

-- No read policy is added here on purpose: vehicle_credentials must never be
-- selectable through the anon key. Only the service role (server) touches it.

-- ── Snapshots: queryable columns beside the jsonb blob (F8) ────────────────
alter table public.vehicle_states
  add column if not exists battery_level integer check (battery_level between 0 and 100),
  add column if not exists range_km numeric(7,1),
  add column if not exists presence text check (presence in ('driving','parked','charging','sleeping','offline')),
  add column if not exists odometer_km numeric(11,1),
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists speed_kmh numeric(5,1),
  add column if not exists power_kw numeric(6,1),
  add column if not exists collected_at timestamptz not null default now();

create index if not exists vehicle_states_vehicle_collected_idx
  on public.vehicle_states (vehicle_id, collected_at desc);

-- ── ActivityEvent (§13) — the Dashboard «Последние события» feed ───────────
create table if not exists public.activity_events (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  type text not null check (type in (
    'trip_started','trip_completed',
    'charging_started','charging_completed','charging_stopped',
    'vehicle_parked','vehicle_woke','vehicle_fell_asleep',
    'climate_started','software_update_started','software_update_completed',
    'credentials_rejected','collection_failed'
  )),
  -- Stable, machine-readable identity for de-duplication of derived events.
  dedupe_key text,
  trip_id uuid,
  charging_session_id uuid,
  -- Presentation-free payload: numbers and ids, never Russian/English labels.
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (vehicle_id, dedupe_key)
);

create index if not exists activity_events_vehicle_time_idx
  on public.activity_events (vehicle_id, occurred_at desc);

alter table public.activity_events enable row level security;

drop policy if exists "owners read activity events" on public.activity_events;
create policy "owners read activity events" on public.activity_events
  for select to authenticated
  using (owner_id = auth.uid() or exists (
    select 1 from public.vehicles v where v.id = activity_events.vehicle_id and v.owner_id = auth.uid()
  ));

-- ── RequestLog (§23) ───────────────────────────────────────────────────────
-- Every column here is post-sanitisation. The schema records `sanitized` as a
-- constraint-backed flag so an unsanitised row cannot be inserted by mistake.
create table if not exists public.api_request_logs (
  id bigint generated always as identity primary key,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  request_type text not null check (request_type in (
    'vehicle_list','vehicle_status','vehicle_data','drive_state','charge_state',
    'climate_state','vehicle_state','vehicle_config','wake_up',
    'token_refresh','authorization','probe'
  )),
  method text not null,
  endpoint text not null,
  url text not null,
  status integer,
  duration_ms integer,
  ok boolean not null,
  error_kind text,
  error_message text,
  attempts integer not null default 1,
  request_headers jsonb not null default '{}'::jsonb,
  request_body text,
  response_headers jsonb not null default '{}'::jsonb,
  response_body text,
  response_bytes integer,
  sanitized boolean not null default true check (sanitized),
  created_at timestamptz not null default now()
);

create index if not exists api_request_logs_time_idx on public.api_request_logs (created_at desc);
create index if not exists api_request_logs_vehicle_idx on public.api_request_logs (vehicle_id, created_at desc);
create index if not exists api_request_logs_failed_idx on public.api_request_logs (created_at desc) where ok = false;

-- Belt and braces: refuse a row that still carries credential material, so a
-- future sanitiser regression fails the write instead of leaking into the UI.
alter table public.api_request_logs add constraint api_request_logs_no_secrets
  check (
    response_body not like '%Bearer ey%'
    and response_body not like '%refresh_token%'
    and request_body not like '%refresh_token%'
    and url not like '%access\_token=%'
    and url not like '%code\_verifier=%'
  );

alter table public.api_request_logs enable row level security;

drop policy if exists "owners read their request logs" on public.api_request_logs;
create policy "owners read their request logs" on public.api_request_logs
  for select to authenticated
  using (owner_id = auth.uid() or exists (
    select 1 from public.vehicles v where v.id = api_request_logs.vehicle_id and v.owner_id = auth.uid()
  ));

-- Retention: the log is diagnostic data about a credential-bearing integration.
-- Call select prune_api_request_logs() from the collector; 7 days by default.
create or replace function public.prune_api_request_logs(retention_days integer default 7)
returns integer
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.api_request_logs
    where created_at < now() - make_interval(days => greatest(1, coalesce(retention_days, 7)))
    returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke all on function public.prune_api_request_logs(integer) from public;
grant execute on function public.prune_api_request_logs(integer) to authenticated;

-- ── User settings: timezone + locale ───────────────────────────────────────
-- 002 already declares distance_unit ('mi','km', default 'mi') and
-- temperature_unit ('C','F'); those are left alone and read as-is by lib/format.
alter table public.user_settings
  add column if not exists time_zone text not null default 'UTC',
  add column if not exists locale text not null default 'ru-RU';

notify pgrst, 'reload schema';
