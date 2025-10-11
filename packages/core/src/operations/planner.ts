import type { ConfigResolver } from '../config/resolver.js'
import type { TsOpsConfig } from '../types.js'
import type { PlanEntry, PlanResult } from './types.js'

/**
 * Dependencies required by Planner.
 */
interface PlannerDependencies<TConfig extends TsOpsConfig<any, any, any, any, any, any>> {
  resolver: ConfigResolver<TConfig>
}

/**
 * Planner resolves the user configuration into a concrete deployment plan.
 *
 * The plan includes:
 * - Which apps deploy to which namespaces
 * - Resolved hosts, images, environment variables
 * - Network configuration (ingress, certificates, etc.)
 *
 * @example
 * ```typescript
 * const planner = new Planner({ resolver })
 * const plan = await planner.plan({ namespace: 'prod', app: 'api' })
 * console.log(plan.entries[0].image) // => 'ghcr.io/org/api:abc123'
 * ```
 */
export class Planner<TConfig extends TsOpsConfig<any, any, any, any, any, any>> {
  private readonly resolver: ConfigResolver<TConfig>

  constructor(dependencies: PlannerDependencies<TConfig>) {
    this.resolver = dependencies.resolver
  }

  /**
   * Creates a deployment plan based on the configuration and filters.
   *
   * @param options - Filtering options
   * @param options.namespace - Target a single namespace (optional)
   * @param options.app - Target a single app (optional)
   * @param options.changedFiles - Filter apps by changed files (optional)
   * @returns Deployment plan with resolved entries
   */
  async plan(
    options: { namespace?: string; app?: string; changedFiles?: string[] } = {}
  ): Promise<PlanResult> {
    const namespaces = this.resolver.namespaces.select(options.namespace)

    // Select apps based on filters (app filter takes precedence over changedFiles)
    let apps: ReturnType<typeof this.resolver.apps.select>
    if (options.app) {
      // Explicit app filter takes precedence
      apps = this.resolver.apps.select(options.app)
    } else if (options.changedFiles && options.changedFiles.length > 0) {
      // Filter by changed files if no explicit app filter
      apps = this.resolver.apps.selectByChangedFiles(options.changedFiles)
    } else {
      // No filter - select all apps
      apps = this.resolver.apps.select()
    }

    const entries: PlanEntry[] = []

    for (const namespace of namespaces) {
      for (const [appName, app] of apps) {
        if (!this.resolver.apps.shouldDeploy(app, namespace)) continue

        const context = this.resolver.namespaces.createHostContext(namespace, { appName })
        let host: string | undefined
        const env = this.resolver.apps.resolveEnv(app, namespace, context)
        const secrets = this.resolver.apps.resolveSecrets(app, namespace, context)
        const configMaps = this.resolver.apps.resolveConfigMaps(app, namespace, context)
        // Use app.image if provided (for external images), otherwise build from registry
        const image = app.image || this.resolver.images.buildRef(appName)
        // resolveNetwork may update host if network returns a domain string
        const { network, host: updatedHost } = this.resolver.apps.resolveNetwork(
          appName,
          app,
          namespace,
          context,
          host
        )
        host = updatedHost || host

        entries.push({
          namespace,
          app: appName,
          host,
          image,
          env,
          secrets,
          configMaps,
          network,
          podAnnotations: app.podAnnotations,
          volumes: app.volumes,
          volumeMounts: app.volumeMounts,
          args: app.args,
          ports: app.ports
        })
      }
    }

    return { entries }
  }
}
