-- 006_fix_polling_precedence_and_log_constraints.sql
-- Apply AFTER 004 and 005. Both issues below were introduced by 004.

-- ── 1. polling_profile must not silently override collection_mode ───────────
-- 004 added `polling_profile text not null default 'default'`. Every existing row —
-- including vehicles deliberately set to `collection_mode = 'passive'` — therefore
-- received 'default' on creation, and the resolver preferred that column. Result:
-- applying 004 turned a passive vehicle into one that issues live Owner API probes,
-- which is the opposite of the promise in AGENTS.md §3.3 and README.
--
-- The column is now nullable with no default, so "the operator never chose a
-- profile" is representable and `collection_mode` governs until Settings writes it.
alter table public.vehicles
  alter column polling_profile drop default,
  alter column polling_profile drop not null;

-- Undo the damage for rows that were never explicitly configured: 'default' was
-- written by the column default, not by a decision, so it is cleared.
update public.vehicles
  set polling_profile = null
  where polling_profile = 'default';

comment on column public.vehicles.polling_profile is
  'Explicit cadence override. NULL means "not chosen" — collection_mode governs.';
comment on column public.vehicles.collection_mode is
  'passive = no Tesla requests at all; conservative = cadence-gated probes, telemetry only when online; on_demand = live only when the user asks.';

-- ── 2. the secret-check constraint rejected legitimate log rows ────────────
-- 004's constraint matched the *key name* `refresh_token`. The sanitizer keeps key
-- names and replaces only values, so a genuine token-endpoint response
--   {"access_token":"[REDACTED]","refresh_token":"[REDACTED]"}
-- violated the check and the insert failed silently — losing precisely the rows
-- needed to diagnose token refresh (§41). Match credential *shapes* instead.
alter table public.api_request_logs drop constraint if exists api_request_logs_no_secrets;

alter table public.api_request_logs add constraint api_request_logs_no_secrets check (
  -- No bearer/Basic credential of the JWT form `eyJ…` anywhere in the text columns.
  coalesce(response_body, '') not like '%Bearer ey%'
  and coalesce(response_body, '') not like '%Basic %'
  and coalesce(response_body, '') not like '%"%":"eyJ%'
  and coalesce(request_body, '') not like '%eyJ%'
  and coalesce(error_message, '') not like '%Bearer ey%'
  and coalesce(url, '') not like '%access\_token=%'
  and coalesce(url, '') not like '%refresh\_token=%'
  and coalesce(url, '') not like '%code\_verifier=%'
  and coalesce(url, '') not like '%code=%'
);

-- Owner attribution lets a returning user see their own history; the app also wrote
-- rows with owner_id NULL, which the RLS select policy then hid from them.
update public.api_request_logs l
  set owner_id = v.owner_id
  from public.vehicles v
  where l.owner_id is null and l.vehicle_id = v.id;

comment on table public.api_request_logs is
  'Sanitised Tesla request log (§23). Key names are preserved, values are replaced with [REDACTED] by lib/tesla/sanitize.ts before insert.';

notify pgrst, 'reload schema';
