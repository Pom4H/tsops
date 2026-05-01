/**
 * `@tsops/vercel` — Vercel platform adapter for tsops.
 *
 * Status: skeleton. The port surface, types, mapping, planner, and
 * deployer are wired together; the API adapter throws stubs and needs
 * filling in. See `docs/guide/vercel.md` for the integration plan.
 *
 * Usage shape (target):
 *
 * ```ts
 * import { defineConfig } from 'tsops'
 * import { vercel } from '@tsops/vercel'
 *
 * export default defineConfig({
 *   apps: {
 *     web: {
 *       platform: vercel({ projectId: 'prj_abc', deploySource: 'git' }),
 *       ingress: ({ domain }) => ({ domain: `app.${domain}` }),
 *       env: ({ secret }) => ({
 *         SENTRY_DSN: secret('web', 'SENTRY_DSN')
 *       })
 *     },
 *     api: {
 *       // Stays on Kubernetes — hybrid topology
 *       build: { type: 'dockerfile', context: './api', dockerfile: './api/Dockerfile' },
 *       ports: [{ name: 'http', port: 80, targetPort: 8080 }]
 *     }
 *   }
 * })
 * ```
 *
 * The `platform: vercel({...})` marker is what routes the app away from
 * the kubectl path and into this package at build/deploy time.
 */

export type {
  VercelChange,
  VercelDeployResult,
  VercelDeploySource,
  VercelEnvVar,
  VercelEnvironment,
  VercelPlatformOptions
} from './types.js'

export type {
  TriggerDeploymentOptions,
  VercelClient,
  VercelProject
} from './ports/vercel.js'

export { VercelApi, type VercelApiOptions } from './adapters/api.js'
export { diffDomains, diffEnvVars, resolveEnvironment } from './mapping.js'
export { VercelPlanner, type PlannableApp, type VercelPlannerOptions } from './operations/planner.js'
export { VercelDeployer, type VercelDeployerOptions } from './operations/deployer.js'

import type { VercelPlatformOptions } from './types.js'

/**
 * Tag an app as a Vercel deployment target. Returns a `VercelPlatformOptions`
 * literal that the orchestrator inspects to route the app away from the
 * kubectl path.
 *
 * The `kind: 'vercel'` discriminator is what the orchestrator switches on,
 * so a future `aws()`, `flyio()`, or `cloudrun()` helper can coexist.
 */
export function vercel(
  options: Omit<VercelPlatformOptions, 'kind'>
): VercelPlatformOptions {
  return { kind: 'vercel', ...options }
}
