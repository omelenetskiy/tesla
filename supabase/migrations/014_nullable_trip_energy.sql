-- 014_nullable_trip_energy.sql
-- Missing energy telemetry is represented by NULL, never fabricated zero.

alter table public.trips
  alter column energy_used_kwh drop not null,
  alter column energy_used drop not null,
  alter column efficiency_wh_per_km drop not null;

update public.trips
set
  energy_used_kwh = null,
  energy_used = null,
  efficiency_wh_per_km = null,
  energy_calculation_method = null,
  updated_at = now()
where coalesce(energy_used_kwh, energy_used) = 0
  and efficiency_wh_per_km is null
  and coalesce(distance_km, 0) > 0;

notify pgrst, 'reload schema';

