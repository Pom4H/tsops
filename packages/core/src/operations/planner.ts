import type { ConfigResolver } from '../config/resolver.js'
import {
  buildGraph,
  topoSort,
  validateDependencies,
  type DependencyGraph
} from '../dependencies/graph.js'
import { normalizePorts } from '../network/ports.js'
import type { DockerfileBuild, ServicePort, TsOpsConfig } from '../types.js'
import {
  enforceMode,
  scanBuildEnv,
  scanRuntimeEnv,
  type SensitiveEnvFinding
} from '../validation/sensitive-env.js'
import type { PlanEntry, PlanResult } from './types.js'

/**
 * Dependencies required by Planner.
 */
interface PlannerDependencies<TConfig extends TsOpsConfig<any, any, any, any, any, any>> {
  resolver: ConfigResolver<TConfig>
  /**
   * Raw config; used by validation hooks that need access to fields beyond
   * what the resolver exposes (e.g. `validation.sensitiveEnv`). Optional so
   * existing call sites keep working.
   */
  config?: TConfig
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
  private readonly config?: TConfig

  constructor(dependencies: PlannerDependencies<TConfig>) {
    this.resolver = dependencies.resolver
    this.config = dependencies.config
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
    const allAppsForDeps = this.resolver.apps.select()
    const knownAppNames = new Set(allAppsForDeps.map(([name]) => name))
    const entries: PlanEntry[] = []

    const sensitiveEnvConfig = this.config?.validation?.sensitiveEnv
    const findings: SensitiveEnvFinding[] = []
    const scannedBuilds = new Set<string>()
    const dependencies: Record<string, { graph: DependencyGraph; order: string[] }> = {}
    let hasAnyDeps = false

    for (const namespace of namespaces) {
      const namespaceStart = entries.length
      const namespaceApps: Array<{ name: string; needs: readonly string[] }> = []

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

        const needs = (app.needs as readonly string[] | undefined) ?? []
        if (needs.length > 0) hasAnyDeps = true
        namespaceApps.push({ name: appName, needs })

        const entry: PlanEntry = {
          namespace,
          app: appName,
          host,
          image,
          env: resolvedEnv.env,
          envFrom: resolvedEnv.envFrom,
          needs: needs.length > 0 ? needs : undefined,
          secrets,
          configMaps,
          network,
          podAnnotations: resolveParam(app.podAnnotations as Parameters<typeof resolveParam>[0]) as Record<string, string> | undefined,
          volumes: resolveParam(app.volumes as Parameters<typeof resolveParam>[0]) as PlanEntry['volumes'],
          volumeMounts: resolveParam(app.volumeMounts as Parameters<typeof resolveParam>[0]) as PlanEntry['volumeMounts'],
          args: resolveParam(app.args as Parameters<typeof resolveParam>[0]) as string[] | undefined,
          ports: resolvePorts(app.ports as ServicePort[] | ((ctx: typeof context) => ServicePort[]) | undefined)
        }
        entries.push(entry)

        if (sensitiveEnvConfig) {
          findings.push(...scanRuntimeEnv(entry, sensitiveEnvConfig))
          // Build env is namespace-independent — scan each app once.
          if (!scannedBuilds.has(appName)) {
            scannedBuilds.add(appName)
            findings.push(
              ...scanBuildEnv(
                appName,
                app.build as DockerfileBuild | undefined,
                sensitiveEnvConfig
              )
            )
          }
        }
      }

      // Validate and order the dependency graph within this namespace.
      const deployedInNs = new Set(namespaceApps.map((a) => a.name))
      const hasNsDeps = namespaceApps.some((a) => a.needs.length > 0)
      if (hasNsDeps) {
        const errors = validateDependencies(
          namespaceApps,
          knownAppNames,
          deployedInNs,
          namespace
        )
        if (errors.length > 0) {
          const summary = errors.map((e) => `  - ${e.message}`).join('\n')
          throw new Error(
            `Invalid app dependencies in namespace "${namespace}":\n${summary}`
          )
        }

        const order = topoSort(namespaceApps)
        const entriesByApp = new Map(
          entries.slice(namespaceStart).map((e) => [e.app, e])
        )
        for (let i = 0; i < order.length; i++) {
          entries[namespaceStart + i] = entriesByApp.get(order[i])!
        }
        dependencies[namespace] = { graph: buildGraph(namespaceApps), order }
      }
    }

    enforceMode(findings, sensitiveEnvConfig)

    return {
      entries,
      warnings: findings,
      dependencies: hasAnyDeps ? dependencies : undefined
    }
  }
}
