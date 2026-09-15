-- Keep measurement cells numeric and unit-neutral.
-- Unit preferences remain in vehicle/user settings because the vehicle can switch
-- between km/mi, C/F, and psi/bar; telemetry payloads remain the raw source of truth.

alter table public.trips
  alter column energy_source_unit drop default,
  alter column energy_source_unit drop not null;

update public.trips
set energy_source_unit = null
where energy_source_unit is not null;


