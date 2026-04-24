import type { ConfigResolver } from '../config/resolver.js'
import { normalizePorts } from '../network/ports.js'
import type { ServicePort, TsOpsConfig } from '../types.js'
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
   * @returns Deployment plan with resolved entries
   */
  async plan(options: { namespace?: string; app?: string } = {}): Promise<PlanResult> {
    const namespaces = this.resolver.namespaces.select(options.namespace)
    const apps = this.resolver.apps.select(options.app)
    const entries: PlanEntry[] = []

    for (const namespace of namespaces) {
      for (const [appName, app] of apps) {
        if (!this.resolver.apps.shouldDeploy(app, namespace)) continue

        const context = this.resolver.namespaces.createHostContext(namespace, { appName })
        const resolvedEnv = this.resolver.apps.resolveEnv(app, namespace, context)
        const secrets = this.resolver.apps.resolveSecrets(app, namespace, context)
        const configMaps = this.resolver.apps.resolveConfigMaps(app, namespace, context)
        // Use app.image if provided (for external images), otherwise build from registry
        const image = app.image || this.resolver.images.buildRef(appName)
        const { network, host } = this.resolver.apps.resolveNetwork(appName, app, context)

        // Resolve dynamic parameters (can be static values or functions)
        const resolveParam = <T>(param: T | ((ctx: typeof context) => T) | undefined): T | undefined => {
          if (param === undefined) return undefined
          return typeof param === 'function' ? (param as (ctx: typeof context) => T)(context) : param
        }

        const resolvePorts = (
          param: ServicePort[] | ((ctx: typeof context) => ServicePort[]) | undefined
        ): PlanEntry['ports'] => {
          const resolved = resolveParam<ServicePort[]>(param)
          const normalized = normalizePorts(resolved)
          if (normalized.length === 0) return undefined
          return normalized.map((p) => ({
            name: p.name,
            port: p.servicePort,
            targetPort: p.targetPort,
            containerPort: p.containerPort,
            protocol: p.protocol,
            localPort: p.localPort
          }))
        }

        entries.push({
          namespace,
          app: appName,
          host,
          image,
          env: resolvedEnv.env,
          envFrom: resolvedEnv.envFrom,
          secrets,
          configMaps,
          network,
          podAnnotations: resolveParam(app.podAnnotations as Parameters<typeof resolveParam>[0]) as Record<string, string> | undefined,
          volumes: resolveParam(app.volumes as Parameters<typeof resolveParam>[0]) as PlanEntry['volumes'],
          volumeMounts: resolveParam(app.volumeMounts as Parameters<typeof resolveParam>[0]) as PlanEntry['volumeMounts'],
          args: resolveParam(app.args as Parameters<typeof resolveParam>[0]) as string[] | undefined,
          ports: resolvePorts(app.ports as ServicePort[] | ((ctx: typeof context) => ServicePort[]) | undefined)
        })
      }
    }

    return { entries }
  }
}
