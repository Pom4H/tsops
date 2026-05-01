/**
 * Vercel-specific types.
 *
 * These mirror the subset of the Vercel REST API that tsops manages.
 * Anything not represented here (analytics, edge config, monitoring, ...)
 * is intentionally out of scope — tsops only owns project settings, env
 * vars, domains, and deployment triggers.
 */

/**
 * Vercel environment buckets. Maps onto a tsops namespace via
 * `VercelPlatformOptions.environment`.
 */
export type VercelEnvironment = 'production' | 'preview' | 'development'

/**
 * Where the source for a Vercel build comes from.
 *
 * - `git`: Vercel pulls from a connected repo on each push (idiomatic flow).
 *   tsops `deploy` only syncs project settings/env/domains; builds happen
 *   outside tsops, triggered by git events.
 * - `api`: tsops triggers a deployment via `POST /v13/deployments` with a
 *   pre-built tarball or git ref. Use this when you need tsops to gate the
 *   deploy on `tsops plan` validation, or to ship from non-git sources.
 */
export type VercelDeploySource = 'git' | 'api'

/**
 * Per-app Vercel options. Attached to an `AppDefinition` via the
 * `platform` field (see `index.ts` for the augmentation).
 */
export interface VercelPlatformOptions {
  kind: 'vercel'

  /** Vercel project ID or slug. Required. */
  projectId: string

  /**
   * Optional team/scope ID. Required for team-owned projects.
   * Equivalent to `--scope` on the Vercel CLI.
   */
  teamId?: string

  /**
   * Maps the active tsops namespace to a Vercel environment bucket.
   * Multiple namespaces can target the same environment (e.g. all
   * `pr-*` overlays → `preview`).
   *
   * @default ({ production }) => production ? 'production' : 'preview'
   */
  environment?: VercelEnvironment | ((ctx: { namespace: string; production: boolean }) => VercelEnvironment)

  /**
   * Where the build is sourced from. See `VercelDeploySource`.
   * @default 'git'
   */
  deploySource?: VercelDeploySource

  /**
   * Domains to attach to this project for the resolved environment.
   * If omitted, tsops uses the value from the app's `ingress` field.
   */
  domains?: string[]

  /**
   * Framework preset hint passed to Vercel on project creation.
   * Optional — Vercel auto-detects in most cases.
   */
  framework?: string
}

/**
 * Resolved env var ready to apply to Vercel.
 */
export interface VercelEnvVar {
  key: string
  value: string
  /** Vercel supports per-env-bucket targeting. */
  target: VercelEnvironment[]
  /** `encrypted` for secrets, `plain` for non-sensitive values. */
  type: 'encrypted' | 'plain'
}

/**
 * Diff returned by the Vercel planner.
 */
export interface VercelChange {
  app: string
  projectId: string
  environment: VercelEnvironment
  envVars: {
    add: VercelEnvVar[]
    update: VercelEnvVar[]
    remove: string[]
  }
  domains: {
    attach: string[]
    detach: string[]
  }
  /** Whether a new deployment will be triggered (deploySource: 'api'). */
  willDeploy: boolean
}

/**
 * Result of `VercelTsOps.deploy()`.
 */
export interface VercelDeployResult {
  app: string
  environment: VercelEnvironment
  deploymentUrl?: string
  appliedEnvVars: number
  attachedDomains: string[]
}
