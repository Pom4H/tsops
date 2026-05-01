import type { VercelEnvironment, VercelPlatformOptions } from './types.js'

/**
 * Resolve a tsops namespace to a Vercel environment bucket.
 *
 * Default policy:
 *   - namespaces flagged `production: true` → `'production'`
 *   - everything else → `'preview'`
 *
 * Apps can override via `VercelPlatformOptions.environment`. This is the
 * one place where the "namespace ↔ environment" mapping lives — keep
 * everything else downstream of this function.
 */
export function resolveEnvironment(
  options: VercelPlatformOptions,
  ctx: { namespace: string; production: boolean }
): VercelEnvironment {
  if (typeof options.environment === 'function') {
    return options.environment(ctx)
  }
  if (options.environment) {
    return options.environment
  }
  return ctx.production ? 'production' : 'preview'
}

/**
 * Diff two flat env-var maps. Returns the operations needed to go from
 * `current` to `desired`. Used by the planner; no side effects.
 *
 * Vercel itself supports per-bucket targeting, but the diff input here is
 * already scoped to a single environment bucket — the caller resolves the
 * bucket via `resolveEnvironment` before calling this.
 */
export function diffEnvVars(
  desired: Record<string, string>,
  current: Record<string, string>
): {
  add: Array<[string, string]>
  update: Array<[string, string]>
  remove: string[]
} {
  const add: Array<[string, string]> = []
  const update: Array<[string, string]> = []
  const remove: string[] = []

  for (const [key, value] of Object.entries(desired)) {
    if (!(key in current)) {
      add.push([key, value])
    } else if (current[key] !== value) {
      update.push([key, value])
    }
  }

  for (const key of Object.keys(current)) {
    if (!(key in desired)) {
      remove.push(key)
    }
  }

  return { add, update, remove }
}

/**
 * Diff two domain sets. Order-independent.
 */
export function diffDomains(
  desired: readonly string[],
  current: readonly string[]
): { attach: string[]; detach: string[] } {
  const desiredSet = new Set(desired)
  const currentSet = new Set(current)
  return {
    attach: [...desiredSet].filter((d) => !currentSet.has(d)),
    detach: [...currentSet].filter((d) => !desiredSet.has(d))
  }
}
