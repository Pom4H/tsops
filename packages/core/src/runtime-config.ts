import type { TsOpsConfig, EnvValue, SecretRef, ConfigMapRef, ExtractNamespaceVarsFromConfig } from './types.js'
import { createConfigResolver } from './config/resolver.js'
import { isSecretRef, isConfigMapRef } from './types.js'

/**
 * Resolved environment variables for a single app.
 * All functions are evaluated, secrets/configMaps are resolved to actual values.
 */
export interface ResolvedAppEnv {
  /** Resolved environment variables as key-value pairs */
  env: Record<string, string>
  /** Internal Kubernetes DNS endpoint */
  internalEndpoint: string
  /** Kubernetes service name */
  serviceName: string
  /** Resolved external host (if configured via network) */
  host?: string
  /** Docker image reference */
  image: string
  /** Resolved secrets (if any) */
  secrets: Record<string, Record<string, string>>
  /** Resolved configMaps (if any) */
  configMaps: Record<string, Record<string, string>>
}

/**
 * Runtime configuration for all apps in a specific namespace.
 * All dynamic values are resolved and ready to use.
 */
export type RuntimeConfig<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>> = {
  /** Current namespace being configured */
  namespace: Extract<keyof TConfig['namespaces'], string>
  /** Project name */
  project: TConfig['project']
  /** Namespace variables */
  namespaceVars: ExtractNamespaceVarsFromConfig<TConfig>
  /** Resolved app configurations */
  apps: {
    [K in Extract<keyof TConfig['apps'], string>]: ResolvedAppEnv
  }
}

/**
 * Creates a runtime configuration for a specific namespace.
 * All functions in the config are evaluated and resolved to actual values.
 * 
 * @param config - TsOps configuration object
 * @param namespace - Target namespace to resolve config for
 * @returns Runtime configuration with all values resolved
 * 
 * @example
 * ```typescript
 * import { createRuntimeConfig } from '@tsops/core'
 * import config from './tsops.config'
 * 
 * // Create runtime config for 'dev' namespace
 * const runtime = createRuntimeConfig(config, 'dev')
 * 
 * // Access resolved environment variables
 * const apiUrl = runtime.apps['worken-api'].env.DATABASE_URL
 * 
 * // Get internal Kubernetes endpoint
 * const endpoint = runtime.apps['worken-api'].internalEndpoint
 * // => 'http://worken-worken-api.dev.svc.cluster.local:3000'
 * 
 * // Type-safe access to all apps
 * for (const [appName, appConfig] of Object.entries(runtime.apps)) {
 *   console.log(`${appName}: ${appConfig.internalEndpoint}`)
 * }
 * ```
 */
export function createRuntimeConfig<
  TConfig extends TsOpsConfig<any, any, any, any, any, any, any>
>(
  config: TConfig,
  namespace: Extract<keyof TConfig['namespaces'], string>
): RuntimeConfig<TConfig> {
  const resolver = createConfigResolver(config)
  
  // Get namespace variables
  const namespaceVars = config.namespaces[namespace] as ExtractNamespaceVarsFromConfig<TConfig>
  
  // Resolve all apps for this namespace
  const apps = {} as RuntimeConfig<TConfig>['apps']
  const appEntries = resolver.apps.select()
  
  for (const [appName, app] of appEntries) {
    // Skip apps that shouldn't be deployed to this namespace
    if (!resolver.apps.shouldDeploy(app, namespace as string)) {
      continue
    }
    
    // Create context for resolution
    const context = resolver.namespaces.createHostContext(namespace as string, { appName })
    
    // Resolve all app properties
    let host: string | undefined = undefined
    const envRaw = resolver.apps.resolveEnv(app, namespace as string, context)
    const secrets = resolver.apps.resolveSecrets(app, namespace as string, context)
    const configMaps = resolver.apps.resolveConfigMaps(app, namespace as string, context)
    const image = app.image || resolver.images.buildRef(appName)
    
    // Resolve network (may set host from network definitions)
    const { host: updatedHost } = resolver.apps.resolveNetwork(
      appName,
      app,
      namespace as string,
      context,
      host
    )
    host = updatedHost || host
    
    // Convert env values to plain strings
    const env = resolveEnvToStrings(envRaw, secrets, configMaps)
    
    // Get service name and internal endpoint
    const serviceName = resolver.project.serviceName(appName)
    const internalEndpoint = buildInternalEndpoint(
      serviceName,
      namespace as string,
      app.ports?.[0]?.targetPort || app.ports?.[0]?.port || 3000
    )
    
    apps[appName as Extract<keyof TConfig['apps'], string>] = {
      env,
      internalEndpoint,
      serviceName,
      host,
      image,
      secrets,
      configMaps
    }
  }
  
  return {
    namespace,
    project: config.project,
    namespaceVars,
    apps
  }
}

/**
 * Helper to resolve env values to plain strings.
 * Handles SecretRef and ConfigMapRef by looking up actual values.
 */
function resolveEnvToStrings(
  envRaw: Record<string, EnvValue> | SecretRef | ConfigMapRef,
  secrets: Record<string, Record<string, string>>,
  configMaps: Record<string, Record<string, string>>
): Record<string, string> {
  const result: Record<string, string> = {}
  
  // Handle envFrom (entire secret/configMap)
  if (isSecretRef(envRaw)) {
    const secretData = secrets[envRaw.secretName]
    if (secretData) {
      Object.assign(result, secretData)
    }
    return result
  }
  
  if (isConfigMapRef(envRaw)) {
    const configMapData = configMaps[envRaw.configMapName]
    if (configMapData) {
      Object.assign(result, configMapData)
    }
    return result
  }
  
  // Handle individual env vars
  for (const [key, value] of Object.entries(envRaw)) {
    if (typeof value === 'string') {
      result[key] = value
    } else if (isSecretRef(value)) {
      // Resolve secret key reference
      const secretData = secrets[value.secretName]
      if (secretData && value.key) {
        result[key] = secretData[value.key]
      }
    } else if (isConfigMapRef(value)) {
      // Resolve configMap key reference
      const configMapData = configMaps[value.configMapName]
      if (configMapData && value.key) {
        result[key] = configMapData[value.key]
      }
    }
  }
  
  return result
}

/**
 * Builds internal Kubernetes service DNS endpoint.
 * Format: http://{serviceName}.{namespace}.svc.cluster.local:{port}
 */
function buildInternalEndpoint(
  serviceName: string,
  namespace: string,
  port: number | string
): string {
  const portNum = typeof port === 'string' ? port : port
  return `http://${serviceName}.${namespace}.svc.cluster.local:${portNum}`
}

/**
 * Type helper to extract runtime config type from a TsOps config.
 * Useful for type annotations.
 * 
 * @example
 * ```typescript
 * import config from './tsops.config'
 * type MyRuntimeConfig = InferRuntimeConfig<typeof config>
 * ```
 */
export type InferRuntimeConfig<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>> = 
  RuntimeConfig<TConfig>
