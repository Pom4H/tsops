import type {
  NamespaceDefinition,
  ClusterDefinition,
  ImagesConfig,
  TsOpsConfig
} from '../types.js'
import { createRuntimeConfig, type RuntimeConfig, type ResolvedAppEnv } from '../runtime-config.js'
import { getEnvironmentVariable } from '../environment-provider.js'

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
   * Get full resolved configuration for an app.
   * Automatically uses current namespace from TSOPS_NAMESPACE env variable.
   * 
   * @param appName - Application name
   * @returns Resolved app configuration
   * 
   * @example
   * ```ts
   * import config from './tsops.config'
   * const app = config.getApp('worken-api')
   * console.log(app.internalEndpoint)
   * console.log(app.externalEndpoint)
   * console.log(app.env)
   * ```
   */
  getApp(appName: Extract<keyof TApps, string>): ResolvedAppEnv
  
  /**
   * Get resolved environment variables for an app.
   * Automatically uses current namespace from TSOPS_NAMESPACE env variable.
   * 
   * @param appName - Application name
   * @returns Resolved environment variables as key-value pairs
   * 
   * @example
   * ```ts
   * import config from './tsops.config'
   * const env = config.getEnv('worken-api')
   * console.log(env.DATABASE_URL)
   * ```
   */
  getEnv(appName: Extract<keyof TApps, string>): Record<string, string>
  
  /**
   * Get internal Kubernetes endpoint for an app.
   * Automatically uses current namespace from TSOPS_NAMESPACE env variable.
   * 
   * @param appName - Application name
   * @returns Internal Kubernetes service endpoint (http://service:port)
   * 
   * @example
   * ```ts
   * import config from './tsops.config'
   * const apiUrl = config.getInternalEndpoint('worken-api')
   * // => 'http://worken-api:3000'
   * ```
   */
  getInternalEndpoint(appName: Extract<keyof TApps, string>): string
  
  /**
   * Get external endpoint for an app (if configured).
   * Automatically uses current namespace from TSOPS_NAMESPACE env variable.
   * Returns undefined if app has no external host configured via network.
   * 
   * @param appName - Application name
   * @returns External HTTPS endpoint or undefined
   * 
   * @example
   * ```ts
   * import config from './tsops.config'
   * const apiUrl = config.getExternalEndpoint('worken-front')
   * // => 'https://worken.localtest.me' (if network host is configured)
   * // => undefined (if no host)
   * ```
   */
  getExternalEndpoint(appName: Extract<keyof TApps, string>): string | undefined
  
  /**
   * Get current namespace name.
   * Determined from TSOPS_NAMESPACE env variable or first namespace in config.
   * 
   * @returns Current namespace name
   * 
   * @example
   * ```ts
   * import config from './tsops.config'
   * const namespace = config.getNamespace()
   * console.log(`Running in: ${namespace}`)
   * ```
   */
  getNamespace(): Extract<keyof TNamespaces, string>
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
): TsOpsConfigWithRuntime<
  TProject,
  TNamespaces,
  TClusters,
  TImages,
  TApps,
  TSecrets,
  TConfigMaps
> {
  type AppName = Extract<keyof TApps, string>
  type TConfig = TsOpsConfig<TProject, TNamespaces, TClusters, TImages, TApps, TSecrets, TConfigMaps>
  
  // Lazy initialization: runtime config is created only when first accessed
  let cachedRuntime: RuntimeConfig<TConfig> | null = null
  let cachedNamespace: string | null = null
  
  function getRuntime(): RuntimeConfig<TConfig> {
    const currentNamespace = getCurrentNamespace(config.namespaces)
    
    // Re-create runtime if namespace changed
    if (cachedRuntime && cachedNamespace === currentNamespace) {
      return cachedRuntime
    }
    
    cachedRuntime = createRuntimeConfig(config as TConfig, currentNamespace)
    cachedNamespace = currentNamespace
    return cachedRuntime
  }
  
  return {
    project: config.project,
    namespaces: config.namespaces,
    clusters: config.clusters,
    images: config.images,
    apps: config.apps,
    secrets: config.secrets,
    configMaps: config.configMaps,
    
    getApp(appName: AppName): ResolvedAppEnv {
      const runtime = getRuntime()
      const app = runtime.apps[appName]
      if (!app) {
        throw new Error(`App "${String(appName)}" not found or not deployed in namespace "${runtime.namespace}"`)
      }
      return app
    },
    
    getEnv(appName: AppName): Record<string, string> {
      const runtime = getRuntime()
      const app = runtime.apps[appName]
      if (!app) {
        throw new Error(`App "${String(appName)}" not found or not deployed in namespace "${runtime.namespace}"`)
      }
      return app.env
    },
    
    getInternalEndpoint(appName: AppName): string {
      const runtime = getRuntime()
      const app = runtime.apps[appName]
      if (!app) {
        throw new Error(`App "${String(appName)}" not found or not deployed in namespace "${runtime.namespace}"`)
      }
      return app.internalEndpoint
    },
    
    getExternalEndpoint(appName: AppName): string | undefined {
      const runtime = getRuntime()
      const app = runtime.apps[appName]
      if (!app) {
        throw new Error(`App "${String(appName)}" not found or not deployed in namespace "${runtime.namespace}"`)
      }
      // External endpoint is derived from network host if present
      return app.host ? `https://${app.host}` : undefined
    },
    
    getNamespace(): Extract<keyof TNamespaces, string> {
      return getCurrentNamespace(config.namespaces)
    }
  }
}
