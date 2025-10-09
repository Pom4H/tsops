/**
 * Runtime configuration hook for pruned services
 * Provides a clean API for accessing service configuration
 */

export interface ServiceEndpoint {
  service: string
  port: number
  protocol: 'http' | 'https' | 'tcp' | 'udp' | 'grpc'
  url: string
  description?: string
}

export interface ServiceConfig {
  name: string
  kind: string
  image: string
  internalUrl: string
  externalUrl?: string
  port: number
  resources: {
    cpu: string
    memory: string
    storage?: string
    replicas?: number
  }
}

export interface EnvironmentReference {
  type: 'static' | 'secret' | 'configmap' | 'env'
  value?: string
  secretName?: string
  secretKey?: string
  configMapName?: string
  configMapKey?: string
  envVar?: string
}

export interface PrunedConfig {
  project: string
  namespace: string
  service: ServiceConfig
  dependencies: ServiceEndpoint[]
  environment: Record<string, EnvironmentReference>
}

/**
 * Runtime configuration hook
 * Provides a clean API for accessing pruned service configuration
 * 
 * @param config - Pruned configuration object
 * @returns Configuration accessor object
 * 
 * @example
 * ```typescript
 * import { useConfig } from 'tsops'
 * 
 * const config = useConfig({
 *   project: 'my-app',
 *   namespace: 'prod',
 *   service: { /* ... */ },
 *   dependencies: [ /* ... */ ],
 *   environment: { /* ... */ }
 * })
 * 
 * // Get service URLs
 * const apiUrl = config.dependency('api').url
 * const authUrl = config.dependency('auth').url
 * 
 * // Get environment variables
 * const port = config.env('PORT')
 * const nodeEnv = config.env('NODE_ENV')
 * ```
 */
export function useConfig(config: PrunedConfig) {
  return {
    // Project metadata
    project: config.project,
    namespace: config.namespace,
    
    // Service info
    service: config.service,
    
    // Dependency access
    dependency: (serviceName: string) => {
      const dep = config.dependencies.find(d => d.service === serviceName)
      if (!dep) {
        throw new Error(`Dependency '${serviceName}' not found`)
      }
      return dep
    },
    
    // Get dependency URL
    dependencyUrl: (serviceName: string) => {
      return config.dependencies.find(d => d.service === serviceName)?.url
    },
    
    // Environment variable access
    env: (key: string) => {
      const envVar = config.environment[key]
      if (!envVar) {
        throw new Error(`Environment variable '${key}' not found`)
      }
      
      // Return static values directly
      if (envVar.type === 'static') {
        return envVar.value
      }
      
      // Return the reference for other types
      return envVar
    },
    
    // Get static environment variable
    envString: (key: string) => {
      const envVar = config.environment[key]
      return envVar?.type === 'static' ? envVar.value : undefined
    },
    
    // Get secret reference
    secretRef: (key: string) => {
      const envVar = config.environment[key]
      if (envVar?.type === 'secret' && envVar.secretName && envVar.secretKey) {
        return { secretName: envVar.secretName, secretKey: envVar.secretKey }
      }
      return undefined
    },
    
    // Get configMap reference
    configMapRef: (key: string) => {
      const envVar = config.environment[key]
      if (envVar?.type === 'configmap' && envVar.configMapName && envVar.configMapKey) {
        return { configMapName: envVar.configMapName, configMapKey: envVar.configMapKey }
      }
      return undefined
    },
    
    // List all dependencies
    dependencies: config.dependencies,
    
    // List all environment variables
    environment: config.environment,
    
    // Check if dependency exists
    hasDependency: (serviceName: string) => {
      return config.dependencies.some(d => d.service === serviceName)
    },
    
    // Get all dependency names
    dependencyNames: config.dependencies.map(d => d.service)
  }
}

/**
 * Type helper for useConfig return type
 */
export type UseConfigReturn = ReturnType<typeof useConfig>

/**
 * Create a configuration from JSON string
 * Useful for generated configurations
 * 
 * @param jsonString - JSON string of pruned configuration
 * @returns Configuration accessor object
 * 
 * @example
 * ```typescript
 * import { useConfig } from 'tsops'
 * 
 * export default useConfig(JSON.stringify(prunedConfig, null, 2))
 * ```
 */
export function useConfigFromJSON(jsonString: string) {
  try {
    const config = JSON.parse(jsonString)
    return useConfig(config)
  } catch (error) {
    throw new Error(`Failed to parse configuration JSON: ${error}`)
  }
}