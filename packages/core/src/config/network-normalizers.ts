/**
 * Network configuration normalizers.
 * These functions transform user-provided network options into resolved configs
 * that can be consumed by the manifest builders.
 */

import type {
  ResolvedCertificateConfig,
  ResolvedIngressConfig,
  ResolvedIngressRouteConfig
} from '@tsops/k8'
import { DEFAULT_HTTP_PORT } from '@tsops/k8'
import type {
  AppCertificateOptions,
  AppIngressOptions,
  AppIngressRouteOptions,
  AppIngressRouteRouteOptions
} from '../types.js'

/**
 * Creates a default network configuration with basic ingress.
 * @param host - The host name for the ingress
 */
export function createDefaultNetwork(host: string): { ingress: ResolvedIngressConfig } {
  return {
    ingress: normalizeIngress(host)
  }
}

/**
 * Creates auto HTTP/HTTPS configuration.
 * This is used when network is specified as a domain string.
 *
 * For local development (*.localtest.me, localhost): uses HTTP only (no cert warnings)
 * For production domains: uses HTTPS with TLS
 *
 * @param domain - The domain name for the app
 * @param serviceName - Name of the Kubernetes service
 * @param options - Optional configuration
 * @returns Ingress configuration
 */
export function createAutoHTTPS(
  domain: string,
  serviceName: string,
  options: { issuer?: string; className?: string } = {}
): {
  ingress: ResolvedIngressConfig
} {
  const className = options.className || 'traefik'

  // Detect if this is a local development domain
  const isLocalDev =
    domain.includes('localtest.me') || domain.includes('localhost') || domain.includes('.local')

  if (isLocalDev) {
    // For local dev: simple HTTP without TLS (no certificate warnings!)
    return {
      ingress: normalizeIngress(domain, {
        className
      })
    }
  }

  // For production: HTTPS with TLS
  const tlsSecretName = `${serviceName}-tls`
  return {
    ingress: normalizeIngress(domain, {
      className,
      annotations: {
        'traefik.ingress.kubernetes.io/router.entrypoints': 'websecure',
        'traefik.ingress.kubernetes.io/router.tls': 'true',
        ...(options.issuer ? { 'cert-manager.io/cluster-issuer': options.issuer } : {})
      },
      tls: [
        {
          secretName: tlsSecretName,
          hosts: [domain]
        }
      ]
    })
  }
}

/**
 * Attempts to extract host/domain from network configuration.
 * Used as fallback when app.host is not explicitly defined.
 *
 * @param options - Network configuration options
 * @returns Extracted domain or undefined
 */
export function extractHostFromNetwork(options: AppIngressOptions): string | undefined {
  // 1. Try certificate.dnsNames
  if (options.certificate && typeof options.certificate === 'object') {
    const dnsNames = options.certificate.dnsNames
    if (dnsNames && dnsNames.length > 0) {
      return dnsNames[0]
    }
  }

  // 2. Try ingress.tls.hosts
  if (options.ingress && typeof options.ingress === 'object') {
    const tls = options.ingress.tls
    if (tls && tls.length > 0 && tls[0].hosts?.length > 0) {
      return tls[0].hosts[0]
    }
  }

  // 3. Try ingressRoute.routes.match pattern
  if (options.ingressRoute && typeof options.ingressRoute === 'object') {
    const routes = options.ingressRoute.routes
    if (routes && routes.length > 0 && routes[0].match) {
      const match = routes[0].match
      // Match Host(`example.com`) pattern
      const hostMatch = match.match(/Host\(`([^`]+)`\)/)
      if (hostMatch) {
        return hostMatch[1]
      }
    }
  }

  return undefined
}

/**
 * Normalizes ingress configuration from user options.
 *
 * @param host - The host name for the ingress
 * @param options - Optional ingress customization
 * @returns Resolved ingress configuration
 */
export function normalizeIngress(
  _host: string,
  options?: AppIngressOptions
): ResolvedIngressConfig {
  return {
    className: options?.className,
    annotations: options?.annotations ? { ...options.annotations } : undefined,
    path: options?.path ?? '/',
    pathType: options?.pathType ?? 'Prefix',
    tls: options?.tls ? options.tls.map((item) => ({ ...item })) : undefined
  }
}

/**
 * Normalizes IngressRoute configuration for Traefik.
 *
 * @param host - The host name (optional, can be provided in route match)
 * @param serviceName - Name of the Kubernetes service
 * @param options - IngressRoute customization
 * @returns Resolved IngressRoute configuration
 */
export function normalizeIngressRoute(
  host: string | undefined,
  serviceName: string,
  options: AppIngressRouteOptions
): ResolvedIngressRouteConfig {
  const routesSource =
    options.routes && options.routes.length > 0
      ? options.routes
      : [{} as AppIngressRouteRouteOptions]

  const routes = routesSource.map((routeOptions) => {
    const match = routeOptions.match ?? (host ? createRouteMatch(host) : undefined)
    if (!match) {
      throw new Error('IngressRoute route requires a match. Provide match or configure app.host().')
    }

    const servicesOptions =
      routeOptions.services && routeOptions.services.length > 0
        ? routeOptions.services
        : [{ name: serviceName, port: DEFAULT_HTTP_PORT }]

    const services = servicesOptions.map((service) => ({
      name: service.name ?? serviceName,
      namespace: service.namespace,
      scheme: service.scheme,
      kind: service.kind ?? 'Service',
      port: service.port ?? DEFAULT_HTTP_PORT,
      nativeLB: service.nativeLB,
      nodePortLB: service.nodePortLB,
      passHostHeader: service.passHostHeader,
      serversTransport: service.serversTransport
    }))

    return {
      match,
      priority: routeOptions.priority,
      middlewares: routeOptions.middlewares ?? options.middlewares,
      services
    }
  })

  const tls = options.tls
    ? {
        ...options.tls,
        domains: options.tls.domains
          ? options.tls.domains.map(
              (domainEntry: NonNullable<typeof options.tls.domains>[number]) => ({
                ...domainEntry
              })
            )
          : undefined
      }
    : undefined

  return {
    entryPoints: options.entryPoints ? [...options.entryPoints] : undefined,
    routes,
    tls
  }
}

/**
 * Normalizes certificate configuration for cert-manager.
 *
 * @param host - The host name (optional, can be provided in dnsNames)
 * @param serviceName - Name of the Kubernetes service (used for secret name)
 * @param options - Certificate customization
 * @returns Resolved certificate configuration
 */
export function normalizeCertificate(
  host: string | undefined,
  serviceName: string,
  options: AppCertificateOptions
): ResolvedCertificateConfig {
  const secretName = options.secretName ?? `${serviceName}-tls`
  const dnsNames =
    options.dnsNames && options.dnsNames.length > 0
      ? [...options.dnsNames]
      : host
        ? [host]
        : (() => {
            throw new Error('Certificate configuration requires dnsNames or an app host().')
          })()

  const certificate: ResolvedCertificateConfig = {
    secretName,
    issuerRef: { ...options.issuerRef },
    dnsNames,
    commonName: options.commonName ?? dnsNames[0]
  }

  if (options.duration !== undefined) certificate.duration = options.duration
  if (options.renewBefore !== undefined) certificate.renewBefore = options.renewBefore
  if (options.isCA !== undefined) certificate.isCA = options.isCA
  if (options.usages !== undefined) certificate.usages = options.usages
  if (options.privateKey !== undefined) certificate.privateKey = { ...options.privateKey }

  return certificate
}

/**
 * Creates a Traefik route match expression for a given host.
 * @param host - The host name
 * @returns Match expression in Traefik format
 */
function createRouteMatch(host: string): string {
  return `Host(\`${host}\`)`
}
