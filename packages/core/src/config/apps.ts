import type {
  AppCertificateOptions,
  AppDefinition,
  AppHostContextWithHelpers,
  AppIngressOptions,
  AppIngressRouteOptions,
  AppNetworkOptions,
  TsOpsConfig,
  EnvValue,
  SecretRef,
  ConfigMapRef,
  ExtractNamespaceVarsFromConfig
} from '../types.js'
import { isSecretRef, isConfigMapRef } from '../types.js'
import type {
  ResolvedNetworkConfig
} from '@tsops/k8'
import type { NamespaceResolver } from './namespaces.js'
import type { ProjectResolver } from './project.js'
import {
  createDefaultNetwork,
  createAutoHTTPS,
  extractHostFromNetwork,
  normalizeIngress,
  normalizeIngressRoute,
  normalizeCertificate
} from './network-normalizers.js'

export type ResolverApp<
  TConfig extends TsOpsConfig<any, any, any, any, any, any, any>
> = AppDefinition<ExtractNamespaceVarsFromConfig<TConfig>, TConfig['project'], Extract<keyof TConfig['namespaces'], string>, TConfig['secrets'], TConfig['configMaps']>

export type AppEntry<
  TConfig extends TsOpsConfig<any, any, any, any, any, any, any>
> = [string, ResolverApp<TConfig>]

export interface AppsResolver<
  TConfig extends TsOpsConfig<any, any, any, any, any, any, any>
> {
  select(target?: string): AppEntry<TConfig>[]
  shouldDeploy(app: ResolverApp<TConfig>, namespace: string): boolean
  resolveEnv(
    app: ResolverApp<TConfig>,
    namespace: string,
    context: AppHostContextWithHelpers<ExtractNamespaceVarsFromConfig<TConfig>, TConfig['project'], Extract<keyof TConfig['namespaces'], string>, TConfig['secrets'], TConfig['configMaps'], TConfig['apps']>
  ): Record<string, EnvValue> | SecretRef | ConfigMapRef
  resolveSecrets(
    app: ResolverApp<TConfig>,
    namespace: string,
    context: AppHostContextWithHelpers<ExtractNamespaceVarsFromConfig<TConfig>, TConfig['project'], Extract<keyof TConfig['namespaces'], string>, TConfig['secrets'], TConfig['configMaps'], TConfig['apps']>
  ): Record<string, Record<string, string>>
  resolveConfigMaps(
    app: ResolverApp<TConfig>,
    namespace: string,
    context: AppHostContextWithHelpers<ExtractNamespaceVarsFromConfig<TConfig>, TConfig['project'], Extract<keyof TConfig['namespaces'], string>, TConfig['secrets'], TConfig['configMaps'], TConfig['apps']>
  ): Record<string, Record<string, string>>
  /**
   * Resolves network configuration. May return updated host if network is specified as domain string.
   */
  resolveNetwork(
    appName: string,
    app: ResolverApp<TConfig>,
    namespace: string,
    context: AppHostContextWithHelpers<ExtractNamespaceVarsFromConfig<TConfig>, TConfig['project'], Extract<keyof TConfig['namespaces'], string>, TConfig['secrets'], TConfig['configMaps'], TConfig['apps']>,
    host: string | undefined
  ): { network: ResolvedNetworkConfig | undefined; host: string | undefined }
}

export function createAppsResolver<
  TConfig extends TsOpsConfig<any, any, any, any, any, any, any>
>(
  config: TConfig,
  namespaces: NamespaceResolver<TConfig>,
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
        return (include as readonly TNamespaceName[]).includes(namespace as TNamespaceName) && 
               !(exclude as readonly TNamespaceName[]).includes(namespace as TNamespaceName)
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
    namespace: string,
    context: AppHostContextWithHelpers<ExtractNamespaceVarsFromConfig<TConfig>, TConfig['project'], Extract<keyof TConfig['namespaces'], string>, TConfig['secrets'], TConfig['configMaps']>
  ): Record<string, EnvValue> | SecretRef | ConfigMapRef {
    const env = app.env
    if (!env) return {}

    if (typeof env === 'function') {
      return env(context)
    }

    return { ...env }
  }

  /**
   * Evaluates network definition (calls it if it's a function).
   */
  function evaluateNetworkDefinition(
    networkDef: ResolverApp<TConfig>['network'],
    networkContext: AppHostContextWithHelpers<ExtractNamespaceVarsFromConfig<TConfig>, TConfig['project'], Extract<keyof TConfig['namespaces'], string>, TConfig['secrets'], TConfig['configMaps']>
  ) {
    if (typeof networkDef === 'function') {
      return networkDef(networkContext)
    }
    return networkDef
  }

  /**
   * Handles boolean network configuration.
   * true = enable default network, false = disable network
   */
  function handleBooleanNetwork(
    resolved: boolean,
    host: string | undefined,
    appName: string
  ): ResolvedNetworkConfig | undefined {
    if (!resolved) return undefined
    if (!host) {
      throw new Error(`App "${appName}" enabled network helpers, but no host is configured.`)
    }
    return createDefaultNetwork(host)
  }

  /**
   * Builds the final network config from user-provided options.
   * Handles ingress, ingressRoute, and certificate configuration.
   */
  function buildNetworkConfig(
    appName: string,
    networkOptions: AppNetworkOptions,
    host: string | undefined,
    serviceName: string
  ): ResolvedNetworkConfig | undefined {
    const result: ResolvedNetworkConfig = {}

    // Try to extract host from network config if not provided
    const effectiveHost = host || extractHostFromNetwork(networkOptions)

    // Handle ingress
    const ingressDef = networkOptions.ingress
    if (ingressDef === undefined) {
      if (effectiveHost) {
        result.ingress = normalizeIngress(effectiveHost)
      }
    } else if (ingressDef) {
      if (!effectiveHost) {
        throw new Error(`App "${appName}" ingress requires a host to be configured or inferrable from network config.`)
      }
      const ingressOptions: AppIngressOptions | undefined =
        typeof ingressDef === 'object' ? ingressDef : undefined
      result.ingress = normalizeIngress(effectiveHost, ingressOptions)
    }

    // Handle ingressRoute (Traefik)
    const ingressRouteDef = networkOptions.ingressRoute
    if (ingressRouteDef !== undefined && ingressRouteDef !== false) {
      const ingressRouteOptions: AppIngressRouteOptions =
        ingressRouteDef === true ? {} : ingressRouteDef
      result.ingressRoute = normalizeIngressRoute(effectiveHost, serviceName, ingressRouteOptions)
    }

    // Handle certificate (cert-manager)
    const certificateDef = networkOptions.certificate
    if (certificateDef !== undefined && certificateDef !== false) {
      const options: AppCertificateOptions | undefined =
        certificateDef === true ? undefined : certificateDef
      if (!options || !options.issuerRef) {
        throw new Error(`App "${appName}" certificate configuration requires issuerRef.`)
      }
      result.certificate = normalizeCertificate(effectiveHost, serviceName, options)
    }

    return Object.keys(result).length > 0 ? result : undefined
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
    namespace: string,
    context: AppHostContextWithHelpers<ExtractNamespaceVarsFromConfig<TConfig>, TConfig['project'], Extract<keyof TConfig['namespaces'], string>, TConfig['secrets'], TConfig['configMaps']>,
    host: string | undefined
  ): { network: ResolvedNetworkConfig | undefined; host: string | undefined } {
    const networkDef = app.network
    if (networkDef === undefined) {
      return { network: host ? createDefaultNetwork(host) : undefined, host }
    }

    const serviceName = project.serviceName(appName)
    const resolved = evaluateNetworkDefinition(networkDef, context)
    
    if (resolved === undefined) {
      return { network: host ? createDefaultNetwork(host) : undefined, host }
    }

    // Handle string: domain for auto-HTTPS
    // The string becomes the host AND is used to create network config
    if (typeof resolved === 'string') {
      return {
        network: createAutoHTTPS(resolved, serviceName, {
          issuer: context.env('CERT_ISSUER', 'letsencrypt-prod'),
          className: context.env('INGRESS_CLASS', 'traefik')
        }),
        host: resolved
      }
    }

    if (typeof resolved === 'boolean') {
      return { network: handleBooleanNetwork(resolved, host, appName), host }
    }

    if (!resolved || typeof resolved !== 'object') {
      return { network: undefined, host }
    }

    return { network: buildNetworkConfig(appName, resolved, host, serviceName), host }
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
    context: AppHostContextWithHelpers<ExtractNamespaceVarsFromConfig<TConfig>, TConfig['project'], Extract<keyof TConfig['namespaces'], string>, TConfig['secrets'], TConfig['configMaps']>
  ): Record<string, Record<string, string>> {
    if (!config.secrets) return {}

    // Determine used secret names from env
    const envResolved = resolveEnv(app, namespace, context)
    const used = new Set<string>()

    if (envResolved && typeof envResolved === 'object' && !Array.isArray(envResolved)) {
      if (isSecretRef(envResolved)) {
        used.add(envResolved.secretName)
      } else if (!isConfigMapRef(envResolved)) {
        for (const value of Object.values(envResolved)) {
          if (isSecretRef(value)) {
            used.add(value.secretName)
          }
        }
      }
    }

    const result: Record<string, Record<string, string>> = {}
    const secrets = config.secrets as NonNullable<typeof config.secrets>
    for (const secretName of used) {
      const def = secrets[secretName as keyof typeof secrets]
      if (!def) continue
      // Context already includes all namespace variables
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
    context: AppHostContextWithHelpers<ExtractNamespaceVarsFromConfig<TConfig>, TConfig['project'], Extract<keyof TConfig['namespaces'], string>, TConfig['secrets'], TConfig['configMaps']>
  ): Record<string, Record<string, string>> {
    if (!config.configMaps) return {}

    // Determine used configMap names from env
    const envResolved = resolveEnv(app, namespace, context)
    const used = new Set<string>()

    if (envResolved && typeof envResolved === 'object' && !Array.isArray(envResolved)) {
      if (isConfigMapRef(envResolved)) {
        used.add(envResolved.configMapName)
      } else if (!isSecretRef(envResolved)) {
        for (const value of Object.values(envResolved)) {
          if (isConfigMapRef(value)) {
            used.add(value.configMapName)
          }
        }
      }
    }

    const result: Record<string, Record<string, string>> = {}
    const configMaps = config.configMaps as NonNullable<typeof config.configMaps>
    for (const name of used) {
      const def = configMaps[name as keyof typeof configMaps]
      if (!def) continue
      // Context already includes all namespace variables
      result[name] = typeof def === 'function' ? def(context) : { ...def }
    }
    return result
  }

  return {
    select,
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
function isDeployFilter<
  TConfig extends TsOpsConfig<any, any, any, any, any, any>
>(
  value: ResolverApp<TConfig>['deploy']
): value is {
  include?: readonly Extract<keyof TConfig['namespaces'], string>[]
  exclude?: readonly Extract<keyof TConfig['namespaces'], string>[]
} {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
