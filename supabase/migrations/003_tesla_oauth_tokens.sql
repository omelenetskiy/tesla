alter table public.vehicle_credentials
  add column if not exists refresh_token_ciphertext text,
  add column if not exists access_token_expires_at timestamptz;

notify pgrst, 'reload schema';
