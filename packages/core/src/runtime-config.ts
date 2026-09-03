import { createConfigResolver } from './config/resolver.js'
import { getEnvironmentVariable } from './environment-provider.js'
import { type NormalizedPort, normalizePorts, pickPort } from './network/ports.js'
import type {
  DNSType,
  ExtractNamespaceVarsFromConfig,
  NamespaceRuntime,
  TsOpsConfig
} from './types.js'
import { isOverlayNamespace } from './types.js'

const DEFAULT_HTTP_PORT = 80
const DEFAULT_HTTPS_PORT = 443
const CLUSTER_DOMAIN = 'cluster.local'
const DEV_URLS_ENV = 'TSOPS_DEV_URLS'

/**
 * Creates runtime helper functions for a specific namespace.
 *
 * The helpers returned here match {@link AppContextCoreHelpers} semantics: the
 * `service`/`cluster`/`ingress` URL forms are resolved using the namespace's
 * {@link NamespaceRuntime}, and port selection distinguishes
 * `servicePort` / `targetPort` / `localPort` consistently.
 *
 * `tsops dev` injects `TSOPS_DEV_URLS` into local processes. When present,
 * local runtime helpers resolve their primary HTTP endpoint through that stable
 * named URL instead of exposing an ephemeral localhost port.
 */
export function createRuntimeHelpers<
  TConfig extends TsOpsConfig<any, any, any, any, any, any, any>
>(config: TConfig, namespace: Extract<keyof TConfig['namespaces'], string>) {
  const rawNamespace = config.namespaces[namespace]
  if (isOverlayNamespace(rawNamespace as never)) {
    // Runtime helpers are intended for app code reading
    // `process.env.TSOPS_NAMESPACE` (which is the resolved overlay name,
    // e.g. `pr-123` — already a static-shaped namespace from k8s' POV).
    // Calling this with the overlay *template* key (e.g. `preview`) would
    // require runtime vars that the helper has no way to obtain, so fail
    // fast with a clear message instead of throwing somewhere deeper.
    throw new Error(
      `createRuntimeHelpers() does not support overlay template namespaces. ` +
        `"${namespace}" is an overlay; pass the resolved namespace name (e.g. ` +
        `process.env.TSOPS_NAMESPACE inside a deployed pod) instead.`
    )
  }
  const resolver = createConfigResolver(config)
  const namespaceVars = config.namespaces[namespace] as ExtractNamespaceVarsFromConfig<TConfig>
  const runtime = resolveRuntime(namespaceVars)

  type AppName = Extract<keyof TConfig['apps'], string>

  const externalHosts: Record<string, string> = {}
  const externalProtocols: Record<string, 'http' | 'https'> = {}
  const externalPorts: Record<string, number> = {}
  const appsConfig: Record<string, any> = {}
  const portsCache: Record<string, NormalizedPort[]> = {}

  const appEntries = resolver.apps.select()
  for (const [appName, app] of appEntries) {
    appsConfig[appName] = app

    if (!resolver.apps.shouldDeploy(app, namespace as string)) continue

    const tempContext = resolver.namespaces.createHostContext(namespace as string, {
      appName
    })

    const { host, protocol, port } = resolver.apps.resolveNetwork(appName, app, tempContext)

    if (host) {
      externalHosts[appName] = host
      externalProtocols[appName] = protocol ?? 'http'
      if (port) externalPorts[appName] = port
    }
  }

  function getPorts(app: AppName): NormalizedPort[] {
    const cached = portsCache[app]
    if (cached) return cached

    const appConfig = appsConfig[app]
    if (!appConfig) {
      portsCache[app] = []
      return portsCache[app]
    }

    const ctx = resolver.namespaces.createHostContext(namespace as string, { appName: app })
    const raw = typeof appConfig.ports === 'function' ? appConfig.ports(ctx) : appConfig.ports
    const normalized = normalizePorts(raw)
    portsCache[app] = normalized
    return normalized
  }

  function requirePort(app: AppName, portName?: string): NormalizedPort {
    const ports = getPorts(app)
    const selected = pickPort(ports, portName)
    if (!selected) {
      const suffix = portName ? ` named "${portName}"` : ''
      throw new Error(
        `Cannot resolve port${suffix} for app "${app}": no ports configuration found. ` +
          `Add a ports definition to the app configuration.`
      )
    }
    return selected
  }

  const servicePort = (app: AppName, portName?: string): number =>
    requirePort(app, portName).servicePort

  const targetPort = (app: AppName, portName?: string): number =>
    requirePort(app, portName).containerPort

  const listenPort = targetPort

  const port = (app: AppName): number => targetPort(app)

  /**
   * Generate DNS name. Runtime-aware for `service`/`cluster`, always external
   * for `ingress`.
   */
  const dns = (app: AppName, type: DNSType): string => {
    const devUrl = runtime === 'local' ? getDevUrl(app) : undefined

    if (type === 'ingress') {
      // Validate ingress is configured; the host value may still be rewritten
      // to a local dev route or localhost below.
      if (!externalHosts[app]) {
        throw new Error(
          `Cannot get ingress DNS for app "${app}": no ingress configuration found. ` +
            `Add an ingress definition to the app or use 'service' type instead.`
        )
      }
      if (runtime === 'local') return devUrl ? new URL(devUrl).hostname : 'localhost'
      return externalHosts[app]
    }

    if (runtime === 'local') return devUrl ? new URL(devUrl).hostname : 'localhost'

    // docker uses the service name just like kubernetes at the hostname level;
    // the port is what differs and that happens in url().
    if (type === 'cluster' && runtime === 'kubernetes') {
      return `${app}.${namespace}.svc.${CLUSTER_DOMAIN}`
    }

    return app
  }

  /**
   * Generate complete URL. See {@link AppContextCoreHelpers.url} for semantics.
   */
  const url = (
    app: AppName,
    type: DNSType,
    options: { protocol?: 'http' | 'https'; port?: string } = {}
  ): string => {
    const devUrl = runtime === 'local' && !options.port ? getDevUrl(app) : undefined
    if (devUrl) return withProtocol(devUrl, options.protocol)

    const hostname = dns(app, type)

    if (type === 'ingress') {
      const protocol = options.protocol ?? externalProtocols[app] ?? 'http'
      const explicit = externalPorts[app]
      const portStr = explicit ? `:${explicit}` : ''
      return `${protocol}://${hostname}${portStr}`
    }

    const protocol = options.protocol ?? 'http'
    const selected = pickPort(getPorts(app), options.port)
    const portNumber = selectPortForRuntime(selected, runtime)
    const portStr =
      portNumber !== undefined && !isDefaultPort(portNumber, protocol) ? `:${portNumber}` : ''
    return `${protocol}://${hostname}${portStr}`
  }

  const env = (_appName: AppName, key: string): string => {
    return getEnvironmentVariable(key) ?? ''
  }

  return {
    dns,
    url,
    port,
    servicePort,
    targetPort,
    listenPort,
    env
  }
}

function getDevUrl(app: string): string | undefined {
  const raw = getEnvironmentVariable(DEV_URLS_ENV)
  if (!raw) return undefined

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const value = (parsed as Record<string, unknown>)[app]
    if (typeof value !== 'string') return undefined
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.toString().replace(/\/$/, '')
  } catch {
    return undefined
  }
}

function withProtocol(url: string, protocol?: 'http' | 'https'): string {
  if (!protocol) return url
  const parsed = new URL(url)
  parsed.protocol = `${protocol}:`
  return parsed.toString().replace(/\/$/, '')
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
