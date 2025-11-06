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

  // Collect all external hosts with protocol information
  const externalHosts: Record<string, string> = {}
  const externalProtocols: Record<string, 'http' | 'https'> = {}
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

    // Resolve ingress to get external host and protocol
    const { host, protocol } = resolver.apps.resolveNetwork(
      appName,
      app,
      tempContext
    )

    if (host) {
      externalHosts[appName] = host
      // Store protocol, default to http if not specified
      externalProtocols[appName] = protocol || 'http'
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
   * Generate complete URL for different types of resources
   */
  const url = (app: Extract<keyof TConfig['apps'], string>, type: DNSType): string => {
    // Get the DNS name
    const hostname = dns(app, type)

    // For ingress type, use configured protocol (from ingress definition)
    // For cluster/service types, default to http (internal communication)
    const protocol = type === 'ingress' ? (externalProtocols[app] || 'http') : 'http'

    // Build the complete URL
    return `${protocol}://${hostname}`
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
