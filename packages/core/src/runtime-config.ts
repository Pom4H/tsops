import type { TsOpsConfig, DNSType, ExtractNamespaceVarsFromConfig } from './types.js'
import { createConfigResolver } from './config/resolver.js'

/**
 * Runtime helper context for building environment variables and URLs
 */
export interface RuntimeHelperContext<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>> {
  /** Current namespace */
  namespace: Extract<keyof TConfig['namespaces'], string>
  /** Project name */
  project: TConfig['project']
  /** Namespace variables */
  namespaceVars: ExtractNamespaceVarsFromConfig<TConfig>
  /** External hosts mapping */
  externalHosts: Record<string, string>
  /** Apps configuration */
  appsConfig: Record<string, any>
}

/**
 * Simplified runtime configuration with only essential methods
 */
export interface RuntimeConfig<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>> {
  /** Current namespace */
  namespace: Extract<keyof TConfig['namespaces'], string>
  /** Project name */
  project: TConfig['project']
  /** Namespace variables */
  namespaceVars: ExtractNamespaceVarsFromConfig<TConfig>
  /** Get environment variables for an app */
  getEnv(appName: Extract<keyof TConfig['apps'], string>): Record<string, string>
  /** Generate DNS name */
  dns(appName: Extract<keyof TConfig['apps'], string>, type: DNSType): string
  /** Generate complete URL */
  url(appName: Extract<keyof TConfig['apps'], string>, type: DNSType, options?: { protocol?: 'http' | 'https' }): string
}

/**
 * Creates runtime helper functions for a specific namespace
 */
function createRuntimeHelpers<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>>(
  config: TConfig,
  namespace: Extract<keyof TConfig['namespaces'], string>
) {
  const resolver = createConfigResolver(config)
  const namespaceVars = config.namespaces[namespace] as ExtractNamespaceVarsFromConfig<TConfig>
  
  // Collect all external hosts and app configs
  const externalHosts: Record<string, string> = {}
  const appsConfig: Record<string, any> = {}
  
  const appEntries = resolver.apps.select()
  for (const [appName, app] of appEntries) {
    if (!resolver.apps.shouldDeploy(app, namespace as string)) {
      continue
    }
    
    // Store app config
    appsConfig[appName] = app
    
    // Create temporary context to resolve network
    const tempContext = resolver.namespaces.createHostContext(namespace as string, { appName })
    
    // Resolve network to get external host
    const { host } = resolver.apps.resolveNetwork(
      appName,
      app,
      namespace as string,
      tempContext,
      undefined
    )
    
    if (host) {
      externalHosts[appName] = host
    }
  }
  
  const context: RuntimeHelperContext<TConfig> = {
    namespace,
    project: config.project,
    namespaceVars,
    externalHosts,
    appsConfig
  }
  
  /**
   * Generate DNS name for different types of resources
   */
  const dns = (app: Extract<keyof TConfig['apps'], string>, type: DNSType): string => {
    switch (type) {
      case 'service':
        return app
      case 'ingress':
        return context.externalHosts[app] || app
      case 'cluster':
      default:
        return `${app}.${context.namespace}.svc.cluster.local`
    }
  }
  
  /**
   * Generate complete URL for different types of resources with automatic port resolution
   */
  const url = (app: Extract<keyof TConfig['apps'], string>, type: DNSType, options?: { protocol?: 'http' | 'https' }): string => {
    const { protocol = 'http' } = options || {}
    
    // Get the first port from the app's configuration
    const appConfig = context.appsConfig[app]
    const firstPort = appConfig?.ports?.[0]?.port || 80
    
    // Get the DNS name
    const hostname = dns(app, type)
    
    // Build the complete URL
    return `${protocol}://${hostname}:${firstPort}`
  }
  
  /**
   * Build environment variables for an app using helper functions
   */
  const env = (appName: Extract<keyof TConfig['apps'], string>, envBuilder: (helpers: {
    dns: typeof dns
    url: typeof url
    namespace: typeof context.namespace
    project: typeof context.project
    cluster: { name: string; apiServer: string; context: string }
    appName: string
    secret: (secretName: string, key?: string) => any
    configMap: (configMapName: string, key?: string) => any
  } & ExtractNamespaceVarsFromConfig<TConfig>) => Record<string, any>): Record<string, string> => {
    // Create secret and configMap helpers (simplified - return placeholder values)
    const secret = (secretName: string, key?: string) => {
      if (key) {
        return `secret:${secretName}:${key}`
      }
      return `secret:${secretName}`
    }
    
    const configMap = (configMapName: string, key?: string) => {
      if (key) {
        return `configmap:${configMapName}:${key}`
      }
      return `configmap:${configMapName}`
    }
    
    // Create full context for env builder
    const fullContext = {
      dns,
      url,
      namespace: context.namespace,
      project: context.project,
      cluster: { name: '', apiServer: '', context: '' }, // TODO: get from cluster config
      appName,
      secret,
      configMap,
      ...context.namespaceVars
    }
    
    const envRaw = envBuilder(fullContext)
    
    // Convert to plain strings
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(envRaw)) {
      if (typeof value === 'string') {
        result[key] = value
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        result[key] = String(value)
      }
    }
    
    return result
  }
  
  return {
    dns,
    url,
    env,
    context
  }
}

/**
 * Creates a simplified runtime configuration
 */
export function createRuntimeConfig<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>>(
  config: TConfig,
  namespace: Extract<keyof TConfig['namespaces'], string>
): RuntimeConfig<TConfig> {
  const helpers = createRuntimeHelpers(config, namespace)
  
  return {
    namespace: helpers.context.namespace,
    project: helpers.context.project,
    namespaceVars: helpers.context.namespaceVars,
    getEnv: (appName) => {
      const app = helpers.context.appsConfig[appName]
      if (!app || !app.env) {
        return {}
      }
      
      // If env is a function, call it with helpers
      if (typeof app.env === 'function') {
        return helpers.env(appName, app.env)
      }
      
      // If env is an object, return as is
      return app.env
    },
    dns: helpers.dns,
    url: helpers.url
  }
}

/**
 * Type helper for inferring runtime config type
 */
export type InferRuntimeConfig<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>> = 
  RuntimeConfig<TConfig>