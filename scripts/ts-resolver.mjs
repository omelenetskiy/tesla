/**
 * Resolution hook so `node` can run the TypeScript checks directly.
 *
 * The app imports siblings extensionless (`./config`), which is correct for the
 * bundler and wrong for Node ESM. Rewriting the specifier here keeps that a
 * dev-only concern instead of forcing `.ts` extensions through the source tree.
 */
export async function resolve(specifier, context, nextResolve) {
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
