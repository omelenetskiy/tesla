/**
 * SUPERSEDED — kept only as a re-export shim so nothing that still imports this
 * path breaks. The implementation now lives in `lib/tesla/auth.ts`.
 *
 * Removed from this module (plan E4, requirement §14):
 *   `loginWithTeslaPassword()`, `verifyTeslaMfa()`, `getLoginPage()`,
 *   `getMfaFactorId()`, `parseHiddenInputs()`, `hasChallenge()`,
 *   `getCookieHeader()`, and the `TeslaLoginResult` / `TeslaMfaSession` types.
 *
 * Those functions scraped Tesla's SSO form — posting `identity`/`credential`,
 * carrying `_csrf`, and enumerating MFA factors. The product must never hold a
 * Tesla password, so the capability is gone rather than merely unreferenced. It is
 * also the flow most likely to trip Tesla's WAF, and `README.md` documented it as
 * unsupported anyway.
 *
 * Nothing in `app/` imports this file any more. It can be deleted outright.
 */

export {
  buildAuthorizationUrl,
  createAuthorizationRequest as createOwnerAuthorizationRequest,
  decodeTeslaToken,
  accessTokenExpiryIso as getTeslaAccessTokenExpiry,
  exchangeAuthorizationCode,
  refreshTokens as refreshTeslaToken,
  verifyAccessToken,
  type TeslaTokenSet,
  type TeslaAuthorizationRequest as TeslaAuthorizationSession,
} from './tesla/auth'

export { teslaConfig as TESLA_ENDPOINTS } from './tesla/config'
