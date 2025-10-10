import type {
  NamespaceDefinition,
  ClusterDefinition,
  ImagesConfig,
  TsOpsConfig
} from '../types.js'
import { createRuntimeConfig, type RuntimeConfig } from '../runtime-config.js'
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
   * Get runtime configuration with essential helpers.
   * Automatically uses current namespace from TSOPS_NAMESPACE env variable.
   * 
   * @returns Runtime configuration with env, dns, url helpers
   * 
   * @example
   * ```ts
   * import config from './tsops.config'
   * const runtime = config.getRuntime()
   * const env = runtime.getEnv('api')
   * const dns = runtime.dns('api', 'cluster')
   * const url = runtime.url('api', 'ingress')
   * ```
   */
  getRuntime(): RuntimeConfig<TsOpsConfig<TProject, TNamespaces, TClusters, TImages, TApps, TSecrets, TConfigMaps>>
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
    
    getRuntime(): RuntimeConfig<TConfig> {
      return getRuntime()
    }
  }
}
