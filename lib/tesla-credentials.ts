/**
 * SUPERSEDED — re-export shim. The implementation now lives in `lib/tesla/tokens.ts`,
 * which adds the pieces this version lacked: refresh serialisation per vehicle (two
 * parallel refreshes with a rotating secret is how a working credential gets burned),
 * issuer-derived region for refresh (§18), and the §45 auth state machine.
 *
 * Nothing in `app/` imports this file any more. It can be deleted outright.
 */
export {
  readCredential,
  saveTokenSet,
  refreshCredential as refreshTeslaAccessToken,
  createAccessTokenProvider as getTeslaAccessTokenProvider,
  diagnoseAuth,
  describeCredentialError,
  type TeslaAuthState,
  type StoredCredential as TeslaCredential,
} from './tesla/tokens'
