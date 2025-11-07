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

  // Collect all external hosts with protocol and port information
  const externalHosts: Record<string, string> = {}
  const externalProtocols: Record<string, 'http' | 'https'> = {}
  const externalPorts: Record<string, number> = {}
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

    // Resolve ingress to get external host, protocol, and port
    const { host, protocol, port } = resolver.apps.resolveNetwork(
      appName,
      app,
      tempContext
    )

    if (host) {
      externalHosts[appName] = host
      // Store protocol, default to http if not specified
      externalProtocols[appName] = protocol || 'http'
      // Store port if specified (for local development)
      if (port) {
        externalPorts[appName] = port
      }
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
        if (!externalHosts[app]) {
          throw new Error(
            `Cannot get ingress DNS for app "${app}": no ingress configuration found. ` +
            `Either add an ingress definition to the app or use 'service' or 'cluster' type instead.`
          )
        }
        return externalHosts[app]
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

    // Add port if specified (for ingress type with explicit port, e.g., localhost:3000)
    const port = type === 'ingress' && externalPorts[app] ? `:${externalPorts[app]}` : ''

    // Build the complete URL
    return `${protocol}://${hostname}${port}`
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
