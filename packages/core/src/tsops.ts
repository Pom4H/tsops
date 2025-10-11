import { ManifestBuilder } from '@tsops/k8'
import { type ConfigResolver, createConfigResolver } from './config/resolver.js'
import { type EnvironmentProvider, GlobalEnvironmentProvider } from './environment-provider.js'
import { ConsoleLogger, type Logger } from './logger.js'
import { Builder } from './operations/builder.js'
import { Deployer } from './operations/deployer.js'
import { Planner } from './operations/planner.js'
import type { DockerClient } from './ports/docker.js'
import type { KubectlClient } from './ports/kubectl.js'
import type { TsOpsConfig } from './types.js'

/**
 * Options for configuring TsOps behavior.
 */
export interface TsOpsOptions {
  /**
   * Docker adapter used for build operations.
   */
  docker: DockerClient
  /**
   * Kubectl adapter used for cluster interactions.
   */
  kubectl: KubectlClient
  /**
   * Custom logger for output and debugging.
   * Defaults to ConsoleLogger.
   */
  logger?: Logger
  /**
   * Environment provider for accessing environment variables.
   * Defaults to GlobalEnvironmentProvider.
   */
  env?: EnvironmentProvider
  /**
   * When true, external commands are logged but not executed.
   */
  dryRun?: boolean
}

/**
 * TsOps is the main orchestrator for planning, building, and deploying applications.
 *
 * @example
 * ```typescript
 * import { TsOps, ConsoleLogger } from '@tsops/core'
 * import { Docker, Kubectl, DefaultCommandRunner, GitEnvironmentProvider, ProcessEnvironmentProvider } from '@tsops/node'
 * import config from './tsops.config'
 *
 * const runner = new DefaultCommandRunner()
 * const logger = new ConsoleLogger()
 * const env = new GitEnvironmentProvider(new ProcessEnvironmentProvider())
 *
 * const tsops = new TsOps(config, {
 *   docker: new Docker({ runner, logger, dryRun: true }),
 *   kubectl: new Kubectl({ runner, logger, dryRun: true }),
 *   logger,
 *   env,
 *   dryRun: true
 * })
 * ```
 *
 * For simple Node setups use `createNodeTsOps(config)` from `@tsops/node`, which wires these defaults automatically.
 */
export class TsOps<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>> {
  private readonly logger: Logger
  private readonly env: EnvironmentProvider
  private readonly dryRun: boolean
  private readonly docker: DockerClient
  private readonly kubectl: KubectlClient
  private readonly resolver: ConfigResolver<TConfig>
  private readonly manifestBuilder: ManifestBuilder<TConfig>
  private readonly planner: Planner<TConfig>
  private readonly builder: Builder<TConfig>
  private readonly deployer: Deployer<TConfig>

  constructor(config: TConfig, options: TsOpsOptions) {
    if (!options || !options.docker || !options.kubectl) {
      throw new Error(
        'TsOps requires docker and kubectl adapters. Install @tsops/node or provide custom adapters.'
      )
    }

    this.logger = options.logger ?? new ConsoleLogger()
    this.env = options.env ?? new GlobalEnvironmentProvider()
    this.dryRun = options.dryRun ?? false
    this.docker = options.docker
    this.kubectl = options.kubectl
    this.resolver = createConfigResolver(config, { env: this.env })
    this.manifestBuilder = new ManifestBuilder(config)
    this.planner = new Planner({
      resolver: this.resolver
    })
    this.builder = new Builder({
      docker: this.docker,
      logger: this.logger,
      dryRun: this.dryRun,
      resolver: this.resolver,
      config
    })
    this.deployer = new Deployer({
      manifestBuilder: this.manifestBuilder,
      planner: this.planner,
      kubectl: this.kubectl,
      resolver: this.resolver,
      logger: this.logger
    })
  }

  /**
   * Resolves the configuration into a deployment plan.
   *
   * @param options - Filtering options
   * @param options.namespace - Target a single namespace (optional)
   * @param options.app - Target a single app (optional)
   * @returns Deployment plan with resolved images, hosts, env, and network config
   *
   * @example
   * ```typescript
   * const plan = await tsops.plan({ namespace: 'prod', app: 'api' })
   * console.log(plan.entries[0].image) // => 'ghcr.io/org/api:abc123'
   * ```
   */
  plan(options: { namespace?: string; app?: string } = {}) {
    return this.planner.plan(options)
  }

  /**
   * Generates deployment plan with validation and diff against cluster state.
   *
   * This is useful for previewing what changes will be applied without actually
   * deploying anything. The method:
   * 1. Collects all unique global artifacts (namespaces, secrets, configmaps)
   * 2. Validates and diffs each global artifact once (no duplicates)
   * 3. For each app, validates and diffs app-specific resources (Deployment, Service, Ingress, etc.)
   *
   * This approach ensures that shared resources (like secrets used by multiple apps)
   * are only checked once, avoiding duplicates in the plan output.
   *
   * @param options - Filtering options
   * @param options.namespace - Target a single namespace (optional)
   * @param options.app - Target a single app (optional)
   * @returns Plan with global artifacts and per-app resource changes
   *
   * @example
   * ```typescript
   * const result = await tsops.planWithChanges({ namespace: 'prod' })
   *
   * // Check global resources
   * for (const change of result.global.namespaces) {
   *   console.log(`${change.action}: Namespace/${change.name}`)
   * }
   * for (const change of result.global.secrets) {
   *   console.log(`${change.action}: Secret/${change.namespace}/${change.name}`)
   * }
   *
   * // Check app-specific resources
   * for (const app of result.apps) {
   *   console.log(`\nApp: ${app.app} @ ${app.namespace}`)
   *   for (const change of app.changes) {
   *     console.log(`  ${change.action}: ${change.kind}/${change.name}`)
   *     if (change.diff) {
   *       console.log(change.diff)
   *     }
   *   }
   * }
   * ```
   */
  planWithChanges(options: { namespace?: string; app?: string } = {}) {
    return this.deployer.planWithChanges(options)
  }

  /**
   * Builds and pushes Docker images for configured apps.
   *
   * @param options - Filtering options
   * @param options.app - Target a single app (optional)
   * @param options.namespace - Used to determine dev/prod context (optional)
   * @param options.force - Force rebuild even if image exists in registry (optional)
   * @returns Build results with app names and image references
   *
   * @example
   * ```typescript
   * const result = await tsops.build({ app: 'api' })
   * console.log(result.images[0].image) // => 'ghcr.io/org/api:abc123'
   * ```
   */
  build(options: { app?: string; namespace?: string; force?: boolean } = {}) {
    return this.builder.build(options)
  }

  /**
   * Generates Kubernetes manifests and applies them via kubectl.
   *
   * @param options - Filtering options
   * @param options.namespace - Target a single namespace (optional)
   * @param options.app - Target a single app (optional)
   * @returns Deployment results with applied manifest references
   *
   * @example
   * ```typescript
   * const result = await tsops.deploy({ namespace: 'prod', app: 'api' })
   * console.log(result.entries[0].appliedManifests) // => ['Deployment/api', 'Service/api', ...]
   * ```
   */
  deploy(options: { namespace?: string; app?: string } = {}) {
    return this.deployer.deploy(options)
  }
}
