-- 009_fleet_telemetry_ingest.sql
-- Raw Fleet Telemetry receiver output persisted for audit/debugging and replay into app snapshots.

create table if not exists public.fleet_telemetry_events (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  vin text not null,
  txid text not null,
  txtype text,
  version text,
  device_client_version text,
  activity boolean not null default false,
  is_resend boolean not null default false,
  primary_field text,
  field_names jsonb not null default '[]'::jsonb,
  observed_at timestamptz,
  received_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (vehicle_id, txid)
);

create index if not exists fleet_telemetry_events_vehicle_time_idx
  on public.fleet_telemetry_events (vehicle_id, observed_at desc nulls last, created_at desc);

create index if not exists fleet_telemetry_events_owner_time_idx
  on public.fleet_telemetry_events (owner_id, observed_at desc nulls last, created_at desc);

create index if not exists fleet_telemetry_events_vin_idx
  on public.fleet_telemetry_events (vin, created_at desc);

alter table public.fleet_telemetry_events enable row level security;

drop policy if exists "owners read fleet telemetry events" on public.fleet_telemetry_events;
create policy "owners read fleet telemetry events"
  on public.fleet_telemetry_events
  for select to authenticated
  using (owner_id = auth.uid() or exists (
    select 1 from public.vehicles v where v.id = fleet_telemetry_events.vehicle_id and v.owner_id = auth.uid()
  ));

notify pgrst, 'reload schema';

