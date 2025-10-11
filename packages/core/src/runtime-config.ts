import { createConfigResolver } from './config/resolver.js'
import { getEnvironmentVariable } from './environment-provider.js'
import type { DNSType, ExtractNamespaceVarsFromConfig, TsOpsConfig } from './types.js'

/**
 * Creates runtime helper functions for a specific namespace
 */
export function createRuntimeHelpers<
  TConfig extends TsOpsConfig<any, any, any, any, any, any, any>
>(config: TConfig, namespace: Extract<keyof TConfig['namespaces'], string>) {
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
   * Generate DNS name for different types of resources
   */
  const dns = (app: Extract<keyof TConfig['apps'], string>, type: DNSType): string => {
    switch (type) {
      case 'service':
        return app
      case 'ingress':
        return externalHosts[app] || app
      default:
        return `${app}.${namespace}.svc.cluster.local`
    }
  }

  /**
   * Generate complete URL for different types of resources with automatic port resolution
   */
  const url = (
    app: Extract<keyof TConfig['apps'], string>,
    type: DNSType,
    options?: { protocol?: 'http' | 'https' }
  ): string => {
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
   * Get environment variable for an app.
   * Implementation reads directly from process.env via global provider.
   * The appName argument is accepted for API consistency but not used here.
   */
  const env = (_appName: Extract<keyof TConfig['apps'], string>, key: string): string => {
    return getEnvironmentVariable(key) ?? ''
  }

  return {
    dns,
    url,
    env
  }
}
