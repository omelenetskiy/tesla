/**
 * Resolution hook so `node` can run the TypeScript checks and CLI tools directly.
 *
 * The app imports siblings extensionless (`./config`), which is correct for the bundler and
 * wrong for Node ESM, and it reaches shared modules through the `@/` tsconfig path alias.
 * Handling both here keeps that a dev-only concern instead of forcing `.ts` extensions and
 * `../../` climbs through the source tree.
 *
 * The alias matters for more than tidiness: a command-line tool that cannot import
 * `lib/fleet/tokens.ts` has to reimplement AES-256-GCM token decryption itself, which is
 * exactly the kind of duplicate that quietly drifts from the real one.
 */
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = join(import.meta.dirname, '..')

/** `@/lib/fleet/tokens` -> the real `.ts` file, as a file URL Node can load. */
function resolveAlias(specifier) {
  const base = join(root, specifier.slice(2))
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return pathToFileURL(candidate).href
  }
  return null
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const aliased = resolveAlias(specifier)
    if (aliased) return nextResolve(aliased, context)
  }

  const extensionless = specifier.startsWith('.') && !/\.[a-z]{2,3}$/i.test(specifier)
  if (extensionless) {
    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`, `${specifier}.tsx`]) {
      try {
        return await nextResolve(candidate, context)
      } catch {
        /* try the next shape */
      }
    }
  }

  return nextResolve(specifier, context)
}
