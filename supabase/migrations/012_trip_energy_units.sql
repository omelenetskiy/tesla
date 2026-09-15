-- 012_trip_energy_units.sql
-- Keep display units and derived trip provenance explicitly metric and auditable.

alter table public.user_settings
  alter column distance_unit set default 'km';

-- The product uses metric distance consistently. Existing defaults from 002 were
-- imperial, so normalize rows that still carry that legacy default.
update public.user_settings
set distance_unit = 'km', updated_at = now()
where distance_unit = 'mi';

alter table public.trips
  add column if not exists energy_calculation_method text,
  add column if not exists energy_source_unit text not null default 'kWh',
  add column if not exists telemetry_start_at timestamptz,
  add column if not exists telemetry_end_at timestamptz;

update public.trips
set
  energy_calculation_method = coalesce(energy_calculation_method, case
    when energy_used_kwh is not null then 'power_integration'
    else null
  end),
  telemetry_start_at = coalesce(telemetry_start_at, started_at),
  telemetry_end_at = coalesce(telemetry_end_at, ended_at),
  updated_at = now()
where energy_calculation_method is null
   or telemetry_start_at is null
   or telemetry_end_at is null;

notify pgrst, 'reload schema';

