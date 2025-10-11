import type { TsOpsConfig, DNSType, ExtractNamespaceVarsFromConfig } from './types.js'
import { createConfigResolver } from './config/resolver.js'
import { getEnvironmentVariable } from './environment-provider.js'

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
    // Store app config for all apps, regardless of deploy filters,
    // so url()/dns() have complete information.
    appsConfig[appName] = app
    
    // Create temporary context to resolve ingress
    const tempContext = resolver.namespaces.createHostContext(namespace as string, { appName })
    
    // Resolve ingress to get external host
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
   * Ensure external host for an app is resolved from ingress configuration.
   */
  const ensureExternalHost = (app: Extract<keyof TConfig['apps'], string>) => {
    if (externalHosts[app]) return
    const appDef = appsConfig[app]
    if (!appDef) return
    const tempContext = resolver.namespaces.createHostContext(namespace as string, { appName: app })
    const { host } = resolver.apps.resolveNetwork(app, appDef, namespace as string, tempContext, undefined)
    if (host) {
      externalHosts[app] = host
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
        ensureExternalHost(app)
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
    // Get the DNS name
    const hostname = dns(app, type)
    
    // For ingress, use HTTPS without port by default
    if (type === 'ingress') {
      const { protocol = 'https' } = options || {}
      return `${protocol}://${hostname}`
    }
    
    // For other types, use HTTP with port by default
    const { protocol = 'http' } = options || {}
    const appConfig = appsConfig[app]
    const firstPort = appConfig?.ports?.[0]?.port || 80
    
    // Build the complete URL
    return `${protocol}://${hostname}:${firstPort}`
  }
  
  /**
   * Get environment variable for an app at runtime.
   * Always resolves from process.env (via getEnvironmentVariable),
   * ignoring config-time env mappings. The appName parameter is kept
   * for API shape compatibility but does not affect resolution.
   */
  const env = (_appName: Extract<keyof TConfig['apps'], string>, key: string): string => {
    const value = getEnvironmentVariable(key)
    return value ?? ''
  }
  
  return {
    dns,
    url,
    env
  }
}