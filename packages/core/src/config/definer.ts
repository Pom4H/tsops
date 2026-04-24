import { getEnvironmentVariable } from '../environment-provider.js'
import { createRuntimeHelpers } from '../runtime-config.js'
import type {
  ClusterDefinition,
  DNSType,
  ImagesConfig,
  NamespaceDefinition,
  TsOpsConfig
} from '../types.js'

/**
 * Extended config object with runtime helper methods.
 * All methods automatically use the current namespace from TSOPS_NAMESPACE env var.
 */
export interface TsOpsConfigWithRuntime<
  TProject extends string,
  TNamespaces extends Record<string, NamespaceDefinition>,
  TClusters extends Record<string, ClusterDefinition<Extract<keyof TNamespaces, string>>>,
  TImages extends ImagesConfig,
  // Use simple record to preserve literal app key inference
  TApps extends Record<string, unknown>,
  TSecrets extends Record<string, unknown> | undefined = undefined,
  TConfigMaps extends Record<string, unknown> | undefined = undefined
> extends TsOpsConfig<TProject, TNamespaces, TClusters, TImages, TApps, TSecrets, TConfigMaps> {
  /**
   * Get environment variable for an app.
   * Automatically uses current namespace from TSOPS_NAMESPACE env variable.
   * 
   * @param appName - Application name
   * @param key - Environment variable key
   * @returns Environment variable value
   * 
   * @example
   * ```ts
   * import config from './tsops.config'
   * const nodeEnv = config.env('frontend', 'NODE_ENV')
   * const port = config.env('api', 'PORT')
   * ```
   */
  env(appName: Extract<keyof TApps, string>, key: string): string
  
  /**
   * Generate DNS name for different types of resources.
   * Automatically uses current namespace from TSOPS_NAMESPACE env variable.
   * 
   * @param appName - Application name
   * @param type - DNS type: 'service' or 'ingress'
   * @returns DNS name
   * 
   * @example
   * ```ts
   * import config from './tsops.config'
   * const serviceDns = config.dns('api', 'service')
   * const ingressDns = config.dns('api', 'ingress')
   * ```
   */
  dns(appName: Extract<keyof TApps, string>, type: DNSType): string

  /**
   * Generate complete URL for different types of resources.
   * See {@link AppContextCoreHelpers.url} for semantics.
   */
  url(
    appName: Extract<keyof TApps, string>,
    type: DNSType,
    options?: { protocol?: 'http' | 'https'; port?: string }
  ): string

  /**
   * Numeric container port the app listens on. Alias for {@link listenPort}.
   * Equal to `targetPort` when numeric; falls back to `servicePort` otherwise.
   */
  port(appName: Extract<keyof TApps, string>, portName?: string): number

  /** Port the k8s Service exposes (what other services dial). */
  servicePort(appName: Extract<keyof TApps, string>, portName?: string): number

  /** Numeric container port (what the process should listen on). */
  targetPort(appName: Extract<keyof TApps, string>, portName?: string): number

  /** Alias for {@link targetPort}. */
  listenPort(appName: Extract<keyof TApps, string>, portName?: string): number
}

/**
 * Determine current namespace from environment.
 * Priority: TSOPS_NAMESPACE env var > first namespace in config
 */
function getCurrentNamespace<TNamespaces extends Record<string, NamespaceDefinition>>(
  namespaces: TNamespaces
): Extract<keyof TNamespaces, string> {
  const envNamespace = getEnvironmentVariable('TSOPS_NAMESPACE')
  
  if (envNamespace && envNamespace in namespaces) {
    return envNamespace as Extract<keyof TNamespaces, string>
  }
  
  // Default: use first namespace
  return Object.keys(namespaces)[0] as Extract<keyof TNamespaces, string>
}

export function defineConfig<
  const TProject extends string,
  const TNamespaces extends Record<string, NamespaceDefinition>,
  const TClusters extends Record<string, ClusterDefinition<Extract<keyof TNamespaces, string>>>,
  const TImages extends ImagesConfig,
  const TSecrets extends Record<string, unknown> | undefined,
  const TConfigMaps extends Record<string, unknown> | undefined,
  // Use simple record to preserve literal app key inference
  const TApps extends Record<string, unknown>
>(
  config: TsOpsConfig<TProject, TNamespaces, TClusters, TImages, TApps, TSecrets, TConfigMaps>
): TsOpsConfigWithRuntime<TProject, TNamespaces, TClusters, TImages, TApps, TSecrets, TConfigMaps> {
  type AppName = Extract<keyof TApps, string>
  type TConfig = TsOpsConfig<
  TProject,
  TNamespaces,
  TClusters,
  TImages,
  TApps,
  TSecrets,
  TConfigMaps
  >
  
  // Lazy initialization: runtime helpers are created only when first accessed
  let cachedHelpers: ReturnType<typeof createRuntimeHelpers<TConfig>> | null = null
  let cachedNamespace: string | null = null
  
  function getHelpers() {
    const currentNamespace = getCurrentNamespace(config.namespaces)
    
    // Re-create helpers if namespace changed
    if (cachedHelpers && cachedNamespace === currentNamespace) {
      return cachedHelpers
    }
    
    cachedHelpers = createRuntimeHelpers(config as TConfig, currentNamespace)
    cachedNamespace = currentNamespace
    return cachedHelpers
  }
  
  return {
    project: config.project,
    namespaces: config.namespaces,
    clusters: config.clusters,
    images: config.images,
    apps: config.apps,
    secrets: config.secrets,
    configMaps: config.configMaps,
    
    env(appName: AppName, key: string): string {
      const helpers = getHelpers()
      return helpers.env(appName, key)
    },
    
    dns(appName: AppName, type: DNSType): string {
      const helpers = getHelpers()
      return helpers.dns(appName, type)
    },

    url(
      appName: AppName,
      type: DNSType,
      options?: { protocol?: 'http' | 'https'; port?: string }
    ): string {
      const helpers = getHelpers()
      return helpers.url(appName, type, options)
    },

    port(appName: AppName, portName?: string): number {
      return getHelpers().targetPort(appName, portName)
    },

    servicePort(appName: AppName, portName?: string): number {
      return getHelpers().servicePort(appName, portName)
    },

    targetPort(appName: AppName, portName?: string): number {
      return getHelpers().targetPort(appName, portName)
    },

    listenPort(appName: AppName, portName?: string): number {
      return getHelpers().listenPort(appName, portName)
    }
  }
}
