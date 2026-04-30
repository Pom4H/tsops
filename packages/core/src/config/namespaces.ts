import type { EnvironmentProvider } from '../environment-provider.js'
import { type NormalizedPort, normalizePorts, pickPort } from '../network/ports.js'
import type {
  AppHostContextWithHelpers,
  ClusterMetadata,
  ConfigMapRef,
  DNSType,
  ExtractNamespaceVarsFromConfig,
  NamespaceRuntime,
  OverlayNamespaceDefinition,
  OverlayVars,
  ResourceKind,
  SecretRef,
  TsOpsConfig
} from '../types.js'
import { isOverlayNamespace } from '../types.js'
import type { ProjectResolver } from './project.js'

const CLUSTER_DOMAIN = 'cluster.local'
const DEFAULT_HTTP_PORT = 80
const DEFAULT_HTTPS_PORT = 443

export interface CreateHostContextOptions {
  appName?: string
  cluster?: ClusterMetadata
  externalHosts?: Record<string, string>
  appsConfig?: any
  /** Runtime vars supplied to overlay namespaces via `tsops up --var`. */
  vars?: OverlayVars
}

/**
 * A namespace materialised for a single deploy. For static namespaces this is
 * just the config key. For overlays it carries the resolved name plus the
 * source key so the deployer can find the overlay config and run hooks.
 */
export interface ResolvedNamespace {
  /** Concrete kubernetes namespace name (after applying overlay `naming`). */
  name: string
  /** Original config key — same as `name` for static namespaces. */
  source: string
  /** True when this namespace was produced from an overlay template. */
  overlay: boolean
  /** Base namespace this overlay inherits from (only set when `overlay`). */
  base?: string
  /** Fallback namespace for apps not in --include (only set when `overlay`). */
  fallback?: string
  /** External domain (resolved through overlay `domain` template if any). */
  domain?: string
  /** Overlay definition that produced this namespace, when applicable. */
  definition?: OverlayNamespaceDefinition
  /** Runtime vars used to materialise this overlay. */
  vars?: OverlayVars
}

export interface NamespaceResolver<TConfig extends TsOpsConfig<any, any, any, any, any, any, any>> {
  select(target?: string, vars?: OverlayVars): string[]
  /**
   * Resolve a namespace key (static or overlay) into a concrete `ResolvedNamespace`.
   * Throws if `target` is an overlay and required vars are missing.
   */
  resolve(target: string, vars?: OverlayVars): ResolvedNamespace
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
  function select(target?: string, _vars?: OverlayVars): string[] {
    if (target) {
      if (!config.namespaces[target as keyof TConfig['namespaces']]) {
        throw new Error(`Unknown namespace: ${target}`)
      }
      return [target]
    }

    // Default deploy skips overlay templates — they only materialise when
    // explicitly targeted with vars (e.g. `tsops up preview --var pr=123`).
    return Object.entries(config.namespaces)
      .filter(([, def]) => !isOverlayNamespace(def as any))
      .map(([key]) => key)
  }

  function resolve(target: string, vars?: OverlayVars): ResolvedNamespace {
    const definition = config.namespaces[target as keyof TConfig['namespaces']] as
      | OverlayNamespaceDefinition
      | { domain?: string }
      | undefined
    if (!definition) throw new Error(`Unknown namespace: ${target}`)

    if (!isOverlayNamespace(definition as any)) {
      return {
        name: target,
        source: target,
        overlay: false,
        domain:
          typeof (definition as { domain?: unknown }).domain === 'string'
            ? (definition as { domain: string }).domain
            : undefined
      }
    }

    const overlay = definition as OverlayNamespaceDefinition
    if (!vars) {
      throw new Error(
        `Overlay namespace "${target}" requires runtime vars. ` +
          `Pass them via the CLI (e.g. \`tsops up ${target} --var pr=123\`) or programmatically.`
      )
    }
    const name = overlay.naming(vars)
    if (!name || typeof name !== 'string') {
      throw new Error(
        `Overlay namespace "${target}" produced an invalid name from naming(${JSON.stringify(vars)}).`
      )
    }
    if (!isValidDnsLabel(name)) {
      throw new Error(
        `Overlay namespace "${target}" produced "${name}", which is not a valid DNS-1123 label.`
      )
    }
    const base = overlay.extends
    if (!config.namespaces[base as keyof TConfig['namespaces']]) {
      throw new Error(`Overlay namespace "${target}" extends unknown base namespace "${base}".`)
    }
    return {
      name,
      source: target,
      overlay: true,
      base,
      fallback: overlay.fallback,
      domain: overlay.domain(vars),
      definition: overlay,
      vars
    }
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
    let rawMetadata = config.namespaces[namespace as keyof TConfig['namespaces']] as
      | OverlayNamespaceDefinition
      | Record<string, unknown>
      | undefined
    let resolvedNamespaceName = namespace
    const overlayVars: OverlayVars | undefined = options.vars

    // Overlay namespaces look up their base for static metadata, then layer
    // runtime-resolved fields (name, domain) and the supplied --vars on top.
    if (isOverlayNamespace(rawMetadata as any)) {
      const overlay = rawMetadata as OverlayNamespaceDefinition
      if (!overlayVars) {
        throw new Error(
          `Overlay namespace "${namespace}" requires runtime vars to build its host context.`
        )
      }
      const baseMetadata = config.namespaces[overlay.extends as keyof TConfig['namespaces']]
      if (!baseMetadata) {
        throw new Error(
          `Overlay namespace "${namespace}" extends unknown base namespace "${overlay.extends}".`
        )
      }
      resolvedNamespaceName = overlay.naming(overlayVars)
      const overlayDomain = overlay.domain(overlayVars)
      // Strip overlay-specific fields, keep base metadata, then add resolved domain + vars.
      const {
        extends: _e,
        naming: _n,
        domain: _d,
        fallback: _f,
        cert: _c,
        database: _db,
        ...rest
      } = overlay as Record<string, unknown> & OverlayNamespaceDefinition
      rawMetadata = {
        ...(baseMetadata as Record<string, unknown>),
        ...(rest as Record<string, unknown>),
        domain: overlayDomain,
        ...overlayVars
      }
    }

    const metadata = rawMetadata
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
        return `${app}.${resolvedNamespaceName}.svc.${CLUSTER_DOMAIN}`
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
      namespace: resolvedNamespaceName,
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
    resolve,
    createHostContext
  }
}

const DNS_1123_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/

function isValidDnsLabel(name: string): boolean {
  return name.length <= 63 && DNS_1123_LABEL.test(name)
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
