import { getEnvironmentVariable } from '../environment-provider.js'
import { createRuntimeHelpers } from '../runtime-config.js'
import type { ClusterDefinition, ImagesConfig, NamespaceDefinition, TsOpsConfig } from '../types.js'

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
   * @param type - DNS type: 'cluster', 'service', or 'ingress'
   * @returns DNS name
   * 
   * @example
   * ```ts
   * import config from './tsops.config'
   * const clusterDns = config.dns('frontend', 'cluster')
   * const serviceDns = config.dns('api', 'service')
   * const ingressDns = config.dns('api', 'ingress')
   * ```
   */
  dns(appName: Extract<keyof TApps, string>, type: 'cluster' | 'service' | 'ingress'): string
  
  /**
   * Generate complete URL for different types of resources with automatic port resolution.
   * Automatically uses current namespace from TSOPS_NAMESPACE env variable.
   * 
   * @param appName - Application name
   * @param type - URL type: 'cluster', 'service', or 'ingress'
   * @returns Complete URL with protocol and port
   * 
   * @example
   * ```ts
   * import config from './tsops.config'
   * const clusterUrl = config.url('frontend', 'cluster')
   * const serviceUrl = config.url('api', 'service')
   * const ingressUrl = config.url('api', 'ingress')
   * ```
   */
  url(
    appName: Extract<keyof TApps, string>,
    type: 'cluster' | 'service' | 'ingress'
  ): string
  
  /**
   * Get the port number that an app should listen on.
   * Returns the targetPort (actual container port) from the ports configuration.
   * Automatically uses current namespace from TSOPS_NAMESPACE env variable.
   * 
   * @param appName - Application name
   * @returns Port number the application should listen on
   * 
   * @example
   * ```ts
   * import config from './tsops.config'
   * const PORT = config.port('api')
   * app.listen(PORT) // → 3001 (dev) or 80 (prod)
   * ```
   */
  port(appName: Extract<keyof TApps, string>): number
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
    
    dns(appName: AppName, type: 'cluster' | 'service' | 'ingress'): string {
      const helpers = getHelpers()
      return helpers.dns(appName, type)
    },
    
    url(
      appName: AppName,
      type: 'cluster' | 'service' | 'ingress'
    ): string {
      const helpers = getHelpers()
      return helpers.url(appName, type)
    },
    
    port(appName: AppName): number {
      const helpers = getHelpers()
      return helpers.port(appName)
    }
  }
}
