import type { Logger } from '@tsops/core'
import { diffDomains, diffEnvVars, resolveEnvironment } from '../mapping.js'
import type { VercelClient } from '../ports/vercel.js'
import type {
  VercelChange,
  VercelEnvVar,
  VercelPlatformOptions
} from '../types.js'

export interface VercelPlannerOptions {
  vercel: VercelClient
  logger: Logger
}

/**
 * Input for a single app/namespace plan call. The orchestrator (parallel
 * to `@tsops/core`'s `Planner`) is responsible for resolving these from
 * the user's `tsops.config.ts`.
 */
export interface PlannableApp {
  app: string
  namespace: string
  production: boolean
  platform: VercelPlatformOptions
  /** Resolved env vars for this app/namespace. */
  env: Record<string, string>
  /** Resolved set of domains the app should serve. */
  domains: string[]
  /** Which env keys are sensitive (Vercel `encrypted` type). */
  sensitiveKeys: ReadonlySet<string>
}

/**
 * Diff the desired state of a Vercel app against what's actually
 * configured in the project, the same way `@tsops/core`'s planner diffs
 * against kubectl. No side effects.
 */
export class VercelPlanner {
  private readonly vercel: VercelClient
  private readonly logger: Logger

  constructor(options: VercelPlannerOptions) {
    this.vercel = options.vercel
    this.logger = options.logger
  }

  async planApp(input: PlannableApp): Promise<VercelChange> {
    const environment = resolveEnvironment(input.platform, {
      namespace: input.namespace,
      production: input.production
    })

    const teamId = input.platform.teamId
    const projectId = input.platform.projectId

    const [currentEnv, currentDomains] = await Promise.all([
      this.vercel.listEnvVars(projectId, teamId),
      this.vercel.listDomains(projectId, teamId)
    ])

    const currentEnvForBucket = Object.fromEntries(
      currentEnv
        .filter((v) => v.target.includes(environment))
        .map((v) => [v.key, v.value])
    )

    const envDiff = diffEnvVars(input.env, currentEnvForBucket)
    const domainDiff = diffDomains(input.domains, currentDomains)

    const toVercelEnvVar = ([key, value]: [string, string]): VercelEnvVar => ({
      key,
      value,
      target: [environment],
      type: input.sensitiveKeys.has(key) ? 'encrypted' : 'plain'
    })

    const change: VercelChange = {
      app: input.app,
      projectId,
      environment,
      envVars: {
        add: envDiff.add.map(toVercelEnvVar),
        update: envDiff.update.map(toVercelEnvVar),
        remove: envDiff.remove
      },
      domains: domainDiff,
      willDeploy: input.platform.deploySource === 'api'
    }

    this.logger.debug('vercel.planApp', {
      app: input.app,
      environment,
      addCount: change.envVars.add.length,
      updateCount: change.envVars.update.length,
      removeCount: change.envVars.remove.length,
      attachCount: change.domains.attach.length,
      detachCount: change.domains.detach.length
    })

    return change
  }
}
