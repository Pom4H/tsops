import type { EnvironmentProvider } from '../environment-provider.js'
import { type NormalizedPort, normalizePorts, pickPort } from '../network/ports.js'
import type {
  AppHostContextWithHelpers,
  ClusterMetadata,
  ConfigMapRef,
  DNSType,
  ExtractNamespaceVarsFromConfig,
  NamespaceRuntime,
  ResourceKind,
  SecretRef,
  TsOpsConfig
} from '../types.js'
import type { ProjectResolver } from './project.js'

const CLUSTER_DOMAIN = 'cluster.local'
const DEFAULT_HTTP_PORT = 80
const DEFAULT_HTTPS_PORT = 443

export interface CreateHostContextOptions {
  appName?: string
  cluster?: ClusterMetadata
  externalHosts?: Record<string, string>
  appsConfig?: any
}

export interface NamespaceResolver<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>> {
  select(target?: string): string[]
  createHostContext(
    namespace: string,
    options?: CreateHostContextOptions
  ): AppHostContextWithHelpers<
    ExtractNamespaceVarsFromConfig<TConfig>,
    TConfig['project'],
    Extract<keyof TConfig['namespaces'], string>,
    TConfig['secrets'],
    TConfig['configMaps'],
    TConfig['apps']
  >
}

export function createNamespaceResolver<
  TConfig extends TsOpsConfig<any, any, any, any, any, any, any>
>(
  config: TConfig,
  _project: ProjectResolver<TConfig>,
  envProvider: EnvironmentProvider
): NamespaceResolver<TConfig> {
  function select(target?: string): string[] {
    if (target) {
      if (!config.namespaces[target as keyof TConfig['namespaces']]) {
        throw new Error(`Unknown namespace: ${target}`)
      }
      return [target]
    }

    return Object.keys(config.namespaces)
  }

  function createHostContext(
    namespace: string,
    options: CreateHostContextOptions = {}
  ): AppHostContextWithHelpers<
    ExtractNamespaceVarsFromConfig<TConfig>,
    TConfig['project'],
    Extract<keyof TConfig['namespaces'], string>,
    TConfig['secrets'],
    TConfig['configMaps'],
    TConfig['apps']
  > {
    const metadata = config.namespaces[namespace as keyof TConfig['namespaces']]
    if (!metadata) throw new Error(`Unknown namespace: ${namespace}`)

    const projectName = config.project
    const {
      appName = '',
      cluster = { name: '', apiServer: '', context: '' },
      externalHosts = {},
      appsConfig = {}
    } = options

    // Create secret helper with overload support
    const secret = ((secretName: string, key?: string): SecretRef => {
      if (key !== undefined) {
        return { __type: 'SecretRef' as const, secretName, key }
      }
      return { __type: 'SecretRef' as const, secretName }
    }) as {
      (secretName: string): SecretRef
      (secretName: string, key: string): SecretRef
    }

    // Create configMap helper with overload support
    const configMap = ((configMapName: string, key?: string): ConfigMapRef => {
      if (key !== undefined) {
        return { __type: 'ConfigMapRef' as const, configMapName, key }
      }
      return { __type: 'ConfigMapRef' as const, configMapName }
    }) as {
      (configMapName: string): ConfigMapRef
      (configMapName: string, key: string): ConfigMapRef
    }

    const runtime = resolveRuntime(metadata as { runtime?: NamespaceRuntime; local?: boolean })

    const getPorts = (app: string): NormalizedPort[] => {
      const appConfig = appsConfig[app]
      if (!appConfig) return []
      if (typeof appConfig.ports === 'function') {
        throw new Error(
          `Cannot resolve ports for app "${app}" from a config-time helper (url/servicePort/targetPort): ` +
            `"ports" is defined as a function and therefore only available during plan evaluation. ` +
            `Use a static ports array, or move the caller into an env/ingress function that runs later.`
        )
      }
      return normalizePorts(appConfig.ports)
    }

    const dns = (app: Extract<keyof TConfig['apps'], string>, type: DNSType): string => {
      if (type === 'ingress') return externalHosts[app] || app
      if (runtime === 'local') return 'localhost'
      if (type === 'cluster' && runtime === 'kubernetes') {
        return `${app}.${namespace}.svc.${CLUSTER_DOMAIN}`
      }
      return app
    }

    const url = (
      app: Extract<keyof TConfig['apps'], string>,
      type: DNSType,
      options?: { protocol?: 'http' | 'https'; port?: string }
    ): string => {
      const hostname = dns(app, type)

      if (type === 'ingress') {
        const protocol = options?.protocol ?? 'http'
        return `${protocol}://${hostname}`
      }

      const protocol = options?.protocol ?? 'http'
      const selected = pickPort(getPorts(app), options?.port)
      const portNumber = selectPortForRuntime(selected, runtime)
      const portStr =
        portNumber !== undefined && !isDefaultPort(portNumber, protocol) ? `:${portNumber}` : ''
      return `${protocol}://${hostname}${portStr}`
    }

    const servicePortHelper = (
      app: Extract<keyof TConfig['apps'], string>,
      portName?: string
    ): number => {
      const selected = pickPort(getPorts(app), portName)
      if (!selected) throw new Error(`Cannot resolve service port for app "${app}".`)
      return selected.servicePort
    }

    const targetPortHelper = (
      app: Extract<keyof TConfig['apps'], string>,
      portName?: string
    ): number => {
      const selected = pickPort(getPorts(app), portName)
      if (!selected) throw new Error(`Cannot resolve target port for app "${app}".`)
      return selected.containerPort
    }

    // Label generator
    const label = (key: string, value?: string): string => {
      const labelValue = value || appName
      return `app.kubernetes.io/${key}=${labelValue}`
    }

    // Resource name generator
    const resource = (kind: ResourceKind, name: string): string => {
      const suffix = kind === 'sa' || kind === 'serviceaccount' ? '' : `-${kind}`
      return appName ? `${appName}-${name}${suffix}` : `${name}${suffix}`
    }

    // Environment variable getter
    const env = <T extends string = string>(key: string, fallback?: T): T => {
      const value = envProvider.get(key)
      if (value !== undefined) {
        return value as T
      }
      if (fallback !== undefined) {
        return fallback
      }
      return '' as T
    }

    // Template string helper
    const template = (str: string, vars: Record<string, string>): string => {
      return str.replace(/\{(\w+)\}/g, (_, key) => vars[key] || '')
    }

    // Create context with helpers and spread namespace variables
    return {
      // Metadata
      project: projectName,
      namespace,
      appName,
      cluster,

      // Generators
      dns,
      url,
      label,
      resource,
      servicePort: servicePortHelper,
      targetPort: targetPortHelper,
      listenPort: targetPortHelper,

      // Secrets & ConfigMaps
      secret,
      configMap,

      // Utilities
      env,
      template,

      // ✨ Spread all namespace variables into context
      ...metadata
    } as AppHostContextWithHelpers<
      ExtractNamespaceVarsFromConfig<TConfig>,
      TConfig['project'],
      Extract<keyof TConfig['namespaces'], string>,
      TConfig['secrets'],
      TConfig['configMaps']
    >
  }

  return {
    select,
    createHostContext
  }
}

function resolveRuntime(
  namespaceVars: { runtime?: NamespaceRuntime; local?: boolean } | undefined
): NamespaceRuntime {
  if (namespaceVars?.runtime) return namespaceVars.runtime
  if (namespaceVars?.local === true) return 'local'
  return 'kubernetes'
}

function selectPortForRuntime(
  selected: NormalizedPort | undefined,
  runtime: NamespaceRuntime
): number | undefined {
  if (!selected) return undefined
  switch (runtime) {
    case 'local':
      return selected.localPort ?? selected.containerPort
    case 'docker':
      return selected.containerPort
    case 'kubernetes':
    default:
      return selected.servicePort
  }
}

function isDefaultPort(port: number, protocol: 'http' | 'https'): boolean {
  return (
    (protocol === 'http' && port === DEFAULT_HTTP_PORT) ||
    (protocol === 'https' && port === DEFAULT_HTTPS_PORT)
  )
}

/**
 * Standalone DNS utility function for building Kubernetes DNS names.
 * This is used by runtime-config.ts to build internal endpoints consistently.
 *
 * @param serviceName - Service name
 * @param namespace - Kubernetes namespace
 * @param port - Port number
 * @param options - Additional options
 * @returns Service DNS name with protocol and port
 */
export function buildDNS(
  serviceName: string,
  namespace: string,
  port: number | string,
  options: { protocol?: 'http' | 'https' | 'tcp' | 'udp'; clusterDomain?: string } = {}
): string {
  const portNum = typeof port === 'string' ? port : port
  const { protocol = 'http', clusterDomain = 'cluster.local' } = options

  const dns = `${serviceName}.${namespace}.svc.${clusterDomain}`

  if (protocol) {
    return `${protocol}://${dns}:${portNum}`
  }

  return `${dns}:${portNum}`
}
