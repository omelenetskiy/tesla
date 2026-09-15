-- The history writer uses ON CONFLICT (vehicle_id, dedupe_key).
-- Keep the indexes partial so legacy rows without a dedupe key remain valid.

create unique index if not exists trips_vehicle_dedupe_uidx
  on public.trips (vehicle_id, dedupe_key)
  where dedupe_key is not null;

create unique index if not exists battery_snapshots_vehicle_dedupe_uidx
  on public.battery_snapshots (vehicle_id, dedupe_key)
  where dedupe_key is not null;

create unique index if not exists charging_sessions_vehicle_dedupe_uidx
  on public.charging_sessions (vehicle_id, dedupe_key)
  where dedupe_key is not null;

