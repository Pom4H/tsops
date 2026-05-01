import type { VercelEnvVar, VercelEnvironment } from '../types.js'

/**
 * Port for talking to Vercel. Two implementations are planned:
 *
 *  - `VercelApi` — REST API client (the default; needs `VERCEL_TOKEN`).
 *  - `VercelCli` — wraps the `vercel` CLI. Useful in CI where the token
 *    is already configured for the CLI.
 *
 * Keeping this as a port (not a concrete class) follows the same
 * dependency-injection pattern as `DockerClient` / `KubectlClient` in
 * `@tsops/core`, so consumers can swap implementations or stub them in
 * tests.
 */
export interface VercelClient {
  /**
   * Fetch project metadata. Returns `null` if the project does not exist
   * (the planner uses this for "create vs update" decisions).
   */
  getProject(projectId: string, teamId?: string): Promise<VercelProject | null>

  /**
   * List env vars currently configured for the project.
   * The planner diffs against this to produce `VercelChange.envVars`.
   */
  listEnvVars(projectId: string, teamId?: string): Promise<VercelEnvVar[]>

  /**
   * Idempotently upsert env vars. Vercel's API distinguishes create and
   * update; the adapter is expected to hide that.
   */
  upsertEnvVars(
    projectId: string,
    envVars: VercelEnvVar[],
    teamId?: string
  ): Promise<void>

  /**
   * Remove env vars by key for the given environment buckets.
   */
  removeEnvVars(
    projectId: string,
    keys: string[],
    target: VercelEnvironment[],
    teamId?: string
  ): Promise<void>

  /**
   * List domains currently attached to the project.
   */
  listDomains(projectId: string, teamId?: string): Promise<string[]>

  /**
   * Attach a domain to the project. Vercel will lazily provision TLS.
   */
  attachDomain(projectId: string, domain: string, teamId?: string): Promise<void>

  /**
   * Detach a domain. Used when the app's ingress changes or an overlay
   * is torn down.
   */
  detachDomain(projectId: string, domain: string, teamId?: string): Promise<void>

  /**
   * Trigger a deployment. Only invoked when `deploySource: 'api'`.
   * For `'git'`, deployments are triggered by Vercel's git integration
   * and tsops only syncs surrounding state.
   */
  triggerDeployment(
    projectId: string,
    options: TriggerDeploymentOptions,
    teamId?: string
  ): Promise<{ url: string; id: string }>
}

export interface VercelProject {
  id: string
  name: string
  framework?: string
}

export interface TriggerDeploymentOptions {
  /** Vercel environment target. */
  target: VercelEnvironment
  /** Git ref to deploy (branch, sha, tag). Mutually exclusive with `tarball`. */
  gitRef?: string
  /** Pre-built tarball URL. Mutually exclusive with `gitRef`. */
  tarball?: string
  /** Optional human-readable description recorded with the deployment. */
  meta?: Record<string, string>
}
