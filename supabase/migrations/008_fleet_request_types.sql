-- 008_fleet_request_types.sql
-- Apply after 004 and 006.
--
-- The Fleet path introduces two request kinds the legacy API never had: a vehicle command
-- (POST /api/1/vehicles/{tag}/command/{name}) and a telemetry configuration write. Neither is
-- in 004's CHECK list, and `recordRequest` swallows insert errors — so without this migration
-- every command would vanish from the audit log silently, which is the same failure mode that
-- hid redacted request rows until 006.
alter table public.api_request_logs drop constraint if exists api_request_logs_request_type_check;

alter table public.api_request_logs add constraint api_request_logs_request_type_check check (request_type in (
  'vehicle_list','vehicle_status','vehicle_data','drive_state','charge_state',
  'climate_state','vehicle_state','vehicle_config','wake_up',
  'token_refresh','authorization','probe',
  'command','telemetry_config'
));

-- VIN-keyed identity: the Fleet list writes the VIN into provider_vehicle_id, so the comment
-- that still describes it as a legacy short id has to change or the next reader will "fix" it.
comment on column public.vehicles.provider_vehicle_id is 'Natural key from the provider: the VIN under Fleet, the short id under the retired legacy API.';
comment on column public.vehicles.owner_api_id is 'Short id — valid as {vehicle_tag} alongside the VIN; never the long vehicle_id.';

notify pgrst, 'reload schema';
