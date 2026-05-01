import type { Logger } from '@tsops/core'
import type {
  TriggerDeploymentOptions,
  VercelClient,
  VercelProject
} from '../ports/vercel.js'
import type { VercelEnvVar, VercelEnvironment } from '../types.js'

export interface VercelApiOptions {
  /** Vercel personal or team token. Defaults to `process.env.VERCEL_TOKEN`. */
  token?: string
  /** Default team ID; per-call `teamId` overrides this. */
  teamId?: string
  logger: Logger
  /** When true, log API calls but don't execute. Mirrors `dryRun` in node adapters. */
  dryRun?: boolean
  /** Override base URL for testing against a mock server. */
  baseUrl?: string
}

/**
 * REST API adapter for Vercel.
 *
 * Skeleton — all methods log + throw so that the orchestrator wiring,
 * planner, and CLI can be exercised end-to-end while real HTTP calls
 * are filled in incrementally.
 *
 * Implementation notes for whoever picks this up:
 *  - Vercel API base: `https://api.vercel.com`
 *  - Auth: `Authorization: Bearer ${token}`
 *  - Team scoping: `?teamId=...` query param on every request
 *  - Env vars: `GET/POST /v9/projects/:id/env`, `DELETE /v9/projects/:id/env/:envId`
 *  - Domains: `GET/POST/DELETE /v9/projects/:id/domains`
 *  - Deployments: `POST /v13/deployments`
 *  - Rate limits: 429 + `Retry-After`. Worth a small backoff helper.
 */
export class VercelApi implements VercelClient {
  private readonly token: string
  private readonly defaultTeamId?: string
  private readonly logger: Logger
  private readonly dryRun: boolean
  private readonly baseUrl: string

  constructor(options: VercelApiOptions) {
    const token = options.token ?? process.env.VERCEL_TOKEN
    if (!token) {
      throw new Error(
        'VercelApi requires a token. Set VERCEL_TOKEN or pass `token` explicitly.'
      )
    }
    this.token = token
    this.defaultTeamId = options.teamId
    this.logger = options.logger
    this.dryRun = options.dryRun ?? false
    this.baseUrl = options.baseUrl ?? 'https://api.vercel.com'
  }

  async getProject(projectId: string, teamId?: string): Promise<VercelProject | null> {
    this.logger.debug('vercel.getProject', { projectId, teamId: teamId ?? this.defaultTeamId })
    throw new Error('VercelApi.getProject: not implemented yet')
  }

  async listEnvVars(projectId: string, teamId?: string): Promise<VercelEnvVar[]> {
    this.logger.debug('vercel.listEnvVars', { projectId, teamId: teamId ?? this.defaultTeamId })
    throw new Error('VercelApi.listEnvVars: not implemented yet')
  }

  async upsertEnvVars(
    projectId: string,
    envVars: VercelEnvVar[],
    teamId?: string
  ): Promise<void> {
    this.logger.info('vercel.upsertEnvVars', {
      projectId,
      teamId: teamId ?? this.defaultTeamId,
      count: envVars.length
    })
    if (this.dryRun) return
    throw new Error('VercelApi.upsertEnvVars: not implemented yet')
  }

  async removeEnvVars(
    projectId: string,
    keys: string[],
    target: VercelEnvironment[],
    teamId?: string
  ): Promise<void> {
    this.logger.info('vercel.removeEnvVars', {
      projectId,
      teamId: teamId ?? this.defaultTeamId,
      keys,
      target
    })
    if (this.dryRun) return
    throw new Error('VercelApi.removeEnvVars: not implemented yet')
  }

  async listDomains(projectId: string, teamId?: string): Promise<string[]> {
    this.logger.debug('vercel.listDomains', { projectId, teamId: teamId ?? this.defaultTeamId })
    throw new Error('VercelApi.listDomains: not implemented yet')
  }

  async attachDomain(projectId: string, domain: string, teamId?: string): Promise<void> {
    this.logger.info('vercel.attachDomain', {
      projectId,
      teamId: teamId ?? this.defaultTeamId,
      domain
    })
    if (this.dryRun) return
    throw new Error('VercelApi.attachDomain: not implemented yet')
  }

  async detachDomain(projectId: string, domain: string, teamId?: string): Promise<void> {
    this.logger.info('vercel.detachDomain', {
      projectId,
      teamId: teamId ?? this.defaultTeamId,
      domain
    })
    if (this.dryRun) return
    throw new Error('VercelApi.detachDomain: not implemented yet')
  }

  async triggerDeployment(
    projectId: string,
    options: TriggerDeploymentOptions,
    teamId?: string
  ): Promise<{ url: string; id: string }> {
    this.logger.info('vercel.triggerDeployment', {
      projectId,
      teamId: teamId ?? this.defaultTeamId,
      target: options.target,
      gitRef: options.gitRef,
      tarball: options.tarball ? '<tarball>' : undefined
    })
    if (this.dryRun) {
      return { url: 'https://example.vercel.app', id: 'dry-run' }
    }
    throw new Error('VercelApi.triggerDeployment: not implemented yet')
  }

  /**
   * Internal HTTP helper. To be filled in when the methods above are
   * implemented. Kept private so the port surface stays minimal.
   */
  // private async request<T>(path: string, init?: RequestInit): Promise<T> { ... }
}
