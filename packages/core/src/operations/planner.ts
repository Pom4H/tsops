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
        const env = this.resolver.apps.resolveEnv(app, namespace, context)
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

        // Resolve and normalize ports (parse string format "80:3000" → { port: 80, targetPort: 3000 })
        type PortInput = { name: string; port: number | string; targetPort?: number | string; protocol?: 'TCP' | 'UDP' }
        type PortOutput = { name: string; port: number; targetPort: number | string; protocol?: 'TCP' | 'UDP' }
        
        const resolvePorts = (
          param: PortInput[] | ((ctx: typeof context) => PortInput[]) | undefined
        ): PortOutput[] | undefined => {
          const resolved = resolveParam<PortInput[]>(param)
          if (!resolved || !Array.isArray(resolved)) return undefined

          return resolved.map(portDef => {
            // If port is string like "80:3000", parse it
            if (typeof portDef.port === 'string') {
              const parts = portDef.port.split(':')
              if (parts.length === 2) {
                return {
                  ...portDef,
                  port: parseInt(parts[0], 10),
                  targetPort: portDef.targetPort ?? parseInt(parts[1], 10)
                }
              }
              // Single number as string
              const parsed = parseInt(portDef.port, 10)
              return {
                ...portDef,
                port: parsed,
                targetPort: portDef.targetPort ?? parsed
              }
            }
            // If port is number but no targetPort, set targetPort = port
            return {
              ...portDef,
              port: portDef.port,
              targetPort: portDef.targetPort ?? portDef.port
            }
          })
        }

        entries.push({
          namespace,
          app: appName,
          host,
          image,
          env,
          secrets,
          configMaps,
          network,
          podAnnotations: resolveParam(app.podAnnotations as Parameters<typeof resolveParam>[0]) as Record<string, string> | undefined,
          volumes: resolveParam(app.volumes as Parameters<typeof resolveParam>[0]) as PlanEntry['volumes'],
          volumeMounts: resolveParam(app.volumeMounts as Parameters<typeof resolveParam>[0]) as PlanEntry['volumeMounts'],
          args: resolveParam(app.args as Parameters<typeof resolveParam>[0]) as string[] | undefined,
          ports: resolvePorts(app.ports as PortInput[] | ((ctx: typeof context) => PortInput[]) | undefined)
        })
      }
    }

    return { entries }
  }
}
