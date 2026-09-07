-- Fleet credentials — phase P1 of docs/TESLA_FLEET_MIGRATION_PLAN.md.
--
-- A Fleet token is scoped to the *owner*, not to a vehicle: one authorization grant covers
-- every vehicle that owner shares with the app. vehicle_credentials was keyed by
-- vehicle_id because the Owner API worked per vehicle; keeping both keyed the same way
-- would let a stale per-vehicle Owner API row silently win over a live Fleet token, which
-- is a failure that cannot be diagnosed from the UI.
create table if not exists public.fleet_credentials (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scopes text[],
  region text not null check (region in ('na', 'eu', 'cn')),
  audience text not null,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No default for region on purpose: the value must come from TESLA_FLEET_REGION, and a
-- silent 'eu' here would hide a misconfiguration that surfaces later as a 403 from the
-- wrong continent's API.

alter table public.fleet_credentials enable row level security;

-- Deliberately no policies, same rule as vehicle_credentials in 004: this is the only
-- table whose leak is not fixable from the app, because revocation has to happen on
-- Tesla's side. Reads go through the service role in lib/fleet/tokens.ts and nowhere else.

comment on table public.fleet_credentials is 'Fleet API owner-scoped tokens, AES-256-GCM at rest. Service-role only.';

notify pgrst, 'reload schema';
