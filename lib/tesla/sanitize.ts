/**
 * Redaction for everything that leaves a request boundary into a log row, the
 * debug console, or an error message (§23, §30).
 *
 * This is deliberately the only place that knows which strings are secret, so a
 * new endpoint cannot accidentally become observable-but-unsafe.
 */

const REDACTED = '[REDACTED]'

/** Header names that must never be persisted or rendered, in any casing. */
const SECRET_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-refresh-token',
])

/**
 * Body/query keys carrying credential material. `tokens` and `backseat_token`
 * appear in the Owner API vehicle list itself, so response bodies are scrubbed too.
 */
const SECRET_KEY_PATTERN = /(access_token|refresh_token|id_token|auth_token|authcode|authorization|backseat_token|^tokens$|client_secret|secret|password|credential|passcode|code_verifier|code_challenge|pkce|session_token|api_key|private_key|otp)/i

function isSecretKey(key: string) {
  return SECRET_KEY_PATTERN.test(key)
}

export function sanitizeHeaders(headers: Headers | Record<string, string | undefined> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!headers) return out
  // Materialised to an array: the project compiles against target es5, where
  // iterating a Headers iterator directly is not allowed.
  const entries: Array<[string, string | undefined]> =
    typeof (headers as Headers).forEach === 'function'
      ? Array.from((headers as Headers).entries())
      : Object.entries(headers as Record<string, string | undefined>)
  for (const [key, value] of entries) {
    if (value === undefined) continue
    out[key] = SECRET_HEADERS.has(key.toLowerCase()) || isSecretKey(key) ? REDACTED : String(value).slice(0, 200)
  }
  return out
}

/**
 * `Bearer abc…` → `Bearer [REDACTED]`, keeping the scheme so the console can still
 * show *which* auth style was attempted. Also handles a raw token pasted without a
 * scheme and any `key=value`/`"key":"value"` credential pair.
 */
export function redactText(text: string | null | undefined): string {
  if (!text) return ''
  let out = text
  out = out.replace(/(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/\-=]{8,}/gi, `$1 ${REDACTED}`)
  out = out.replace(/((?:access|refresh|id|auth|session)_token|"access_token"|"refresh_token")\s*[=:]\s*\\?"?[A-Za-z0-9._~+/\-=]{8,}/gi, `$1=${REDACTED}`)
  out = out.replace(/([?&](?:code|state|access_token|refresh_token|code_verifier|client_secret)=)[^&\s"]+/gi, `$1${REDACTED}`)
  out = out.replace(/("(?:access_token|refresh_token|id_token|client_secret|password|passcode|code_verifier|tokens|backseat_token)"\s*:\s*")((?:[^"\\]|\\.){6,})(")/gi, `$1${REDACTED}$3`)
  out = out.replace(/("(?:tokens)"\s*:\s*\[)[^\]]*(\])/gi, `$1"${REDACTED}"$2`)
  return out
}

/** JSON-safe deep scrub used before a body is persisted or rendered. */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[TRUNCATED]'
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSecretKey(key) ? REDACTED : redactValue(item, depth + 1)
    }
    return out
  }
  if (typeof value === 'string') return redactText(value)
  return value
}

export function redactJsonText(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null
  try {
    return JSON.stringify(redactValue(JSON.parse(text)))
  } catch {
    return redactText(text)
  }
}

/** Removes credential params from a URL so the full request target stays debuggable. */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const secretKeys: string[] = []
    parsed.searchParams.forEach((_value, key) => {
      if (isSecretKey(key)) secretKeys.push(key)
    })
    for (const key of secretKeys) parsed.searchParams.set(key, REDACTED)
    return parsed.toString()
  } catch {
    return redactText(url)
  }
}

/**
 * Body scrub for the debug console's request echo: keeps JSON shape, drops
 * credential values. `null` body stays `null` so "no body" renders honestly.
 */
export function sanitizeBody(body: unknown): string | null {
  if (body === null || body === undefined) return null
  const serialized = typeof body === 'string' ? body : JSON.stringify(body)
  return redactJsonText(serialized)?.slice(0, 8_000) ?? null
}
