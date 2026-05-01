import type { Logger } from '@tsops/core'
import type { VercelClient } from '../ports/vercel.js'
import type { VercelChange, VercelDeployResult } from '../types.js'

export interface VercelDeployerOptions {
  vercel: VercelClient
  logger: Logger
}

/**
 * Apply a `VercelChange` produced by the planner.
 *
 * Order matters:
 *   1. Apply env-var add/update/remove (deployment will pick up new values).
 *   2. Attach/detach domains (so the deployment surfaces on the right hostnames).
 *   3. If `willDeploy`, trigger a deployment via the API (only for
 *      `deploySource: 'api'`; `'git'` deploys are triggered by Vercel).
 *
 * Failures abort the remaining steps for the current app — partial state
 * is reported so the caller can decide whether to retry.
 */
export class VercelDeployer {
  private readonly vercel: VercelClient
  private readonly logger: Logger

  constructor(options: VercelDeployerOptions) {
    this.vercel = options.vercel
    this.logger = options.logger
  }

  async apply(
    change: VercelChange,
    options: { teamId?: string; gitRef?: string } = {}
  ): Promise<VercelDeployResult> {
    const { teamId } = options
    const { projectId, environment } = change

    const upserts = [...change.envVars.add, ...change.envVars.update]
    if (upserts.length > 0) {
      await this.vercel.upsertEnvVars(projectId, upserts, teamId)
    }
    if (change.envVars.remove.length > 0) {
      await this.vercel.removeEnvVars(
        projectId,
        change.envVars.remove,
        [environment],
        teamId
      )
    }

    for (const domain of change.domains.attach) {
      await this.vercel.attachDomain(projectId, domain, teamId)
    }
    for (const domain of change.domains.detach) {
      await this.vercel.detachDomain(projectId, domain, teamId)
    }

    let deploymentUrl: string | undefined
    if (change.willDeploy) {
      const result = await this.vercel.triggerDeployment(
        projectId,
        { target: environment, gitRef: options.gitRef },
        teamId
      )
      deploymentUrl = result.url
    }

    this.logger.info('vercel.apply complete', {
      app: change.app,
      environment,
      appliedEnvVars: upserts.length,
      removedEnvVars: change.envVars.remove.length,
      attachedDomains: change.domains.attach.length,
      detachedDomains: change.domains.detach.length,
      deploymentUrl
    })

    return {
      app: change.app,
      environment,
      deploymentUrl,
      appliedEnvVars: upserts.length,
      attachedDomains: change.domains.attach
    }
  }
}
