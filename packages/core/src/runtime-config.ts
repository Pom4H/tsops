import type { TsOpsConfig, DNSType, ExtractNamespaceVarsFromConfig } from './types.js'
import { createConfigResolver } from './config/resolver.js'

/**
 * Creates runtime helper functions for a specific namespace
 */
export function createRuntimeHelpers<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>>(
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
  
  /**
   * Generate DNS name for different types of resources
   */
  const dns = (app: Extract<keyof TConfig['apps'], string>, type: DNSType): string => {
    switch (type) {
      case 'service':
        return app
      case 'ingress':
        return externalHosts[app] || app
      case 'cluster':
      default:
        return `${app}.${namespace}.svc.cluster.local`
    }
  }
  
  /**
   * Generate complete URL for different types of resources with automatic port resolution
   */
  const url = (app: Extract<keyof TConfig['apps'], string>, type: DNSType, options?: { protocol?: 'http' | 'https' }): string => {
    const { protocol = 'http' } = options || {}
    
    // Get the first port from the app's configuration
    const appConfig = appsConfig[app]
    const firstPort = appConfig?.ports?.[0]?.port || 80
    
    // Get the DNS name
    const hostname = dns(app, type)
    
    // Build the complete URL
    return `${protocol}://${hostname}:${firstPort}`
  }
  
  /**
   * Get environment variable for an app
   */
  const env = (appName: Extract<keyof TConfig['apps'], string>, key: string): string => {
    const app = appsConfig[appName]
    if (!app || !app.env) {
      return ''
    }
    
    // If env is a function, call it with helpers
    if (typeof app.env === 'function') {
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
        namespace,
        project: config.project,
        cluster: { name: '', apiServer: '', context: '' }, // TODO: get from cluster config
        appName,
        secret,
        configMap,
        ...namespaceVars
      }
      
      const envRaw = app.env(fullContext)
      return envRaw[key] || ''
    }
    
    // If env is an object, return the specific key
    return app.env[key] || ''
  }
  
  return {
    dns,
    url,
    env
  }
}