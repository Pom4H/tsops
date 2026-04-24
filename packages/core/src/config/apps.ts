import type { ResolvedNetworkConfig } from '@tsops/k8'
import type {
  AppCertificateOptions,
  AppDefinition,
  AppHostContextWithHelpers,
  AppIngressOptions,
  AppIngressRouteOptions,
  ConfigMapRef,
  EnvValue,
  ExtractNamespaceVarsFromConfig,
  ResolvedEnv,
  SecretRef,
  TsOpsConfig
} from '../types.js'
import { isConfigMapRef, isSecretRef } from '../types.js'
import type { NamespaceResolver } from './namespaces.js'
import { createAutoHTTPS } from './ingress.js'
import type { ProjectResolver } from './project.js'

export type ResolverApp<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>> =
  AppDefinition<
    ExtractNamespaceVarsFromConfig<TConfig>,
    TConfig['project'],
    Extract<keyof TConfig['namespaces'], string>,
    TConfig['secrets'],
    TConfig['configMaps']
  >

export type AppEntry<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>> = [
  string,
  ResolverApp<TConfig>
]

export interface AppsResolver<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>> {
  select(target?: string): AppEntry<TConfig>[]
  selectByChangedFiles(changedFiles: string[]): AppEntry<TConfig>[]
  shouldDeploy(app: ResolverApp<TConfig>, namespace: string): boolean
  resolveEnv(
    app: ResolverApp<TConfig>,
    namespace: string,
    context: AppHostContextWithHelpers<
      ExtractNamespaceVarsFromConfig<TConfig>,
      TConfig['project'],
      Extract<keyof TConfig['namespaces'], string>,
      TConfig['secrets'],
      TConfig['configMaps'],
      TConfig['apps']
    >
  ): ResolvedEnv
  resolveSecrets(
    app: ResolverApp<TConfig>,
    namespace: string,
    context: AppHostContextWithHelpers<
      ExtractNamespaceVarsFromConfig<TConfig>,
      TConfig['project'],
      Extract<keyof TConfig['namespaces'], string>,
      TConfig['secrets'],
      TConfig['configMaps'],
      TConfig['apps']
    >
  ): Record<string, Record<string, string>>
  resolveConfigMaps(
    app: ResolverApp<TConfig>,
    namespace: string,
    context: AppHostContextWithHelpers<
      ExtractNamespaceVarsFromConfig<TConfig>,
      TConfig['project'],
      Extract<keyof TConfig['namespaces'], string>,
      TConfig['secrets'],
      TConfig['configMaps'],
      TConfig['apps']
    >
  ): Record<string, Record<string, string>>
  /**
   * Resolves network configuration from ingress definition.
   * Returns ingress config, domain host, protocol (http/https), and optional port.
   */
  resolveNetwork(
    appName: string,
    app: ResolverApp<TConfig>,
    context: AppHostContextWithHelpers<
      ExtractNamespaceVarsFromConfig<TConfig>,
      TConfig['project'],
      Extract<keyof TConfig['namespaces'], string>,
      TConfig['secrets'],
      TConfig['configMaps'],
      TConfig['apps']
    >
  ): { network: ResolvedNetworkConfig | undefined; host: string | undefined; protocol?: 'http' | 'https'; port?: number }
}

export function createAppsResolver<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>>(
  config: TConfig,
  _namespaces: NamespaceResolver<TConfig>,
  project: ProjectResolver<TConfig>
): AppsResolver<TConfig> {
  /**
   * Selects apps to operate on.
   * @param target - Specific app name (optional)
   * @returns Array of [appName, appDefinition] tuples
   * @throws Error if target app is not found
   */
  function select(target?: string): AppEntry<TConfig>[] {
    const entries = Object.entries(config.apps) as AppEntry<TConfig>[]
    if (target) {
      const match = entries.find(([name]) => name === target)
      if (!match) throw new Error(`Unknown app: ${target}`)
      return [match]
    }

    return entries
  }

  /**
   * Selects apps that have changed files in their build context.
   * Useful for incremental builds in monorepo scenarios.
   *
   * @param changedFiles - Array of changed file paths relative to repository root
   * @returns Array of [appName, appDefinition] tuples for affected apps
   *
   * @example
   * ```typescript
   * const changedFiles = ['packages/api/src/index.ts', 'packages/frontend/app/page.tsx']
   * const affectedApps = resolver.apps.selectByChangedFiles(changedFiles)
   * // Returns apps with build.context that matches changed files
   * ```
   */
  function selectByChangedFiles(changedFiles: string[]): AppEntry<TConfig>[] {
    if (changedFiles.length === 0) return []

    const entries = Object.entries(config.apps) as AppEntry<TConfig>[]
    const affected: AppEntry<TConfig>[] = []

    for (const [appName, app] of entries) {
      const build = app.build
      if (!build || typeof build !== 'object' || !('context' in build)) {
        continue
      }

      const context = (build as { context: string }).context

      // Normalize context path (remove trailing slash)
      const normalizedContext = context.replace(/\/$/, '')

      // Check if any changed file is within this app's build context
      const isAffected = changedFiles.some((file) => {
        // Normalize file path
        const normalizedFile = file.replace(/\/$/, '')

        // Check if file is within the app's context directory
        return (
          normalizedFile === normalizedContext || normalizedFile.startsWith(`${normalizedContext}/`)
        )
      })

      if (isAffected) {
        affected.push([appName, app])
      }
    }

    return affected
  }

  /**
   * Determines if an app should be deployed to a namespace.
   * 
   * Rules:
   * - undefined or 'all': deploy to all namespaces
   * - Array: deploy only to listed namespaces
   * - Filter object with include: deploy only to included namespaces (minus excluded)
   * - Filter object with exclude: deploy to all except excluded namespaces
   * 
   * @example
   * shouldDeploy({ deploy: 'all' }, 'prod') // => true
   * shouldDeploy({ deploy: ['prod', 'stage'] }, 'prod') // => true
   * shouldDeploy({ deploy: { exclude: ['dev'] } }, 'dev') // => false
   */
  function shouldDeploy(app: ResolverApp<TConfig>, namespace: string): boolean {
    const deploy = app.deploy
    if (!deploy || deploy === 'all') return true
    
    type TNamespaceName = Extract<keyof TConfig['namespaces'], string>
    if (Array.isArray(deploy)) {
      return (deploy as readonly TNamespaceName[]).includes(namespace as TNamespaceName)
    }
    if (isDeployFilter<TConfig>(deploy)) {
      const include = deploy.include ?? []
      const exclude = deploy.exclude ?? []
      if (include.length > 0) {
        return (
          (include as readonly TNamespaceName[]).includes(namespace as TNamespaceName) &&
               !(exclude as readonly TNamespaceName[]).includes(namespace as TNamespaceName)
        )
      }
      if (exclude.length > 0) {
        return !(exclude as readonly TNamespaceName[]).includes(namespace as TNamespaceName)
      }
    }
    return true
  }

  // host removed: external host inferred from network only

  /**
   * Resolves environment variables for an app in a specific namespace.
   * @param app - The application definition
   * @param namespace - Target namespace
   * @param context - Host context with helpers (includes namespace vars)
   * @returns Resolved environment variables or secret/configMap reference
   */
  function resolveEnv(
    app: ResolverApp<TConfig>,
    _namespace: string,
    context: AppHostContextWithHelpers<
      ExtractNamespaceVarsFromConfig<TConfig>,
      TConfig['project'],
      Extract<keyof TConfig['namespaces'], string>,
      TConfig['secrets'],
      TConfig['configMaps']
    >
  ): ResolvedEnv {
    const result: ResolvedEnv = { env: {}, envFrom: [] }
    collectEnv(app.env, context, result)
    return result
  }

  function collectEnv(source: unknown, context: unknown, result: ResolvedEnv): void {
    if (source === undefined || source === null) return

    if (Array.isArray(source)) {
      for (const item of source) collectEnv(item, context, result)
      return
    }

    if (isSecretRef(source) || isConfigMapRef(source)) {
      result.envFrom.push(source)
      return
    }

    if (typeof source === 'function') {
      // Resolver may itself return an array, a ref, or a plain record.
      collectEnv(source(context), context, result)
      return
    }

    if (typeof source === 'object') {
      for (const [key, value] of Object.entries(source as Record<string, EnvValue>)) {
        result.env[key] = value
      }
    }
  }


  /**
   * Resolves network configuration for an app in a specific namespace.
   * Handles ingress, ingressRoute, and certificate settings.
   * 
   * @param appName - The application name
   * @param app - The application definition
   * @param namespace - Target namespace
   * @param context - Host context with region and domain helper
   * @param host - Resolved host name (optional)
   * @returns Object with network config and potentially updated host
   */
  function resolveNetwork(
    appName: string,
    app: ResolverApp<TConfig>,
    context: AppHostContextWithHelpers<
      ExtractNamespaceVarsFromConfig<TConfig>,
      TConfig['project'],
      Extract<keyof TConfig['namespaces'], string>,
      TConfig['secrets'],
      TConfig['configMaps']
    >
  ): { network: ResolvedNetworkConfig | undefined; host: string | undefined; protocol?: 'http' | 'https'; port?: number } {
    const ingressDef = app.ingress
    if (!ingressDef) {
      return { network: undefined, host: undefined }
    }

    const serviceName = project.serviceName(appName)
    const resolved = typeof ingressDef === 'function' ? ingressDef(context) : ingressDef

    // Check if resolved is valid (function might return undefined/null)
    if (!resolved || !resolved.domain) {
      return { network: undefined, host: undefined }
    }

    // Auto-detect protocol if not specified. Explicit protocol always wins;
    // otherwise local-looking domains default to http and everything else https.
    const protocol =
      resolved.protocol ??
      (resolved.domain.includes('localhost') || resolved.domain.includes('.local')
        ? 'http'
        : 'https')

    const result = createAutoHTTPS(resolved.domain, serviceName, {
          issuer: context.env('CERT_ISSUER', 'letsencrypt-prod'),
      className: context.env('INGRESS_CLASS', 'traefik'),
      protocol
    })

    return {
      network: { ingress: result.ingress },
      host: resolved.domain,
      protocol: result.protocol,
      port: resolved.port
    }
  }

  /**
   * Resolves secrets for an app in a specific namespace.
   * Discovers used secrets from env definition (envFrom and secret key refs).
   * @param app - The application definition
   * @param namespace - Target namespace
   * @param context - Host context with region and domain helper
   * @returns Map of secret name to key-value pairs
   */
  function resolveSecrets(
    app: ResolverApp<TConfig>,
    namespace: string,
    context: AppHostContextWithHelpers<
      ExtractNamespaceVarsFromConfig<TConfig>,
      TConfig['project'],
      Extract<keyof TConfig['namespaces'], string>,
      TConfig['secrets'],
      TConfig['configMaps']
    >
  ): Record<string, Record<string, string>> {
    if (!config.secrets) return {}

    const resolved = resolveEnv(app, namespace, context)
    const used = new Set<string>()

    for (const ref of resolved.envFrom) {
      if (isSecretRef(ref)) used.add(ref.secretName)
    }
    for (const value of Object.values(resolved.env)) {
      if (isSecretRef(value)) used.add(value.secretName)
    }

    const result: Record<string, Record<string, string>> = {}
    const secrets = config.secrets as NonNullable<typeof config.secrets>
    for (const secretName of used) {
      const def = secrets[secretName as keyof typeof secrets]
      if (!def) continue
      result[secretName] = typeof def === 'function' ? def(context) : { ...def }
    }
    return result
  }

  /**
   * Resolves ConfigMaps for an app in a specific namespace.
   * Discovers used configMaps from env definition (envFrom and configMap key refs).
   * @param app - The application definition
   * @param namespace - Target namespace
   * @param context - Host context with region and domain helper
   * @returns Map of ConfigMap name to key-value pairs
   */
  function resolveConfigMaps(
    app: ResolverApp<TConfig>,
    namespace: string,
    context: AppHostContextWithHelpers<
      ExtractNamespaceVarsFromConfig<TConfig>,
      TConfig['project'],
      Extract<keyof TConfig['namespaces'], string>,
      TConfig['secrets'],
      TConfig['configMaps']
    >
  ): Record<string, Record<string, string>> {
    if (!config.configMaps) return {}

    const resolved = resolveEnv(app, namespace, context)
    const used = new Set<string>()

    for (const ref of resolved.envFrom) {
      if (isConfigMapRef(ref)) used.add(ref.configMapName)
    }
    for (const value of Object.values(resolved.env)) {
      if (isConfigMapRef(value)) used.add(value.configMapName)
    }

    const result: Record<string, Record<string, string>> = {}
    const configMaps = config.configMaps as NonNullable<typeof config.configMaps>
    for (const name of used) {
      const def = configMaps[name as keyof typeof configMaps]
      if (!def) continue
      result[name] = typeof def === 'function' ? def(context) : { ...def }
    }
    return result
  }

  return {
    select,
    selectByChangedFiles,
    shouldDeploy,
    resolveEnv,
    resolveSecrets,
    resolveConfigMaps,
    resolveNetwork
  }
}

/**
 * Type guard to check if deploy configuration is a filter object.
 */
function isDeployFilter<TConfig extends TsOpsConfig<any, any, any, any, any, any>>(
  value: ResolverApp<TConfig>['deploy']
): value is {
  include?: readonly Extract<keyof TConfig['namespaces'], string>[]
  exclude?: readonly Extract<keyof TConfig['namespaces'], string>[]
} {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

