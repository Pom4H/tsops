import type { AppIngressOptions } from '../types.js'
import type { ResolvedIngressConfig } from '@tsops/k8'

/**
 * Creates auto HTTP/HTTPS configuration.
 *
 * For local development (*.localtest.me, localhost, *.local): uses HTTP only (no cert warnings)
 * For production domains: uses HTTPS with TLS
 * Protocol can be explicitly specified to override auto-detection
 *
 * @param domain - The domain name for the app
 * @param serviceName - Name of the Kubernetes service
 * @param options - Optional configuration
 * @returns Ingress configuration with protocol information
 */
export function createAutoHTTPS(
  domain: string,
  serviceName: string,
  options: { issuer?: string; className?: string; protocol?: 'http' | 'https' } = {}
): {
  ingress: ResolvedIngressConfig
  protocol: 'http' | 'https'
} {
  const className = options.className || 'traefik'

  // Detect if this is a local development domain
  const isLocalDev =
    domain.includes('localtest.me') || domain.includes('localhost') || domain.includes('.local')

  // Determine protocol: explicit > auto-detection (local = http, prod = https)
  const useHttps = options.protocol ? options.protocol === 'https' : !isLocalDev

  if (!useHttps) {
    // For HTTP: simple ingress without TLS (no certificate warnings!)
    return {
      ingress: normalizeIngress(domain, { className }),
      protocol: 'http'
    }
  }

  // For HTTPS: ingress with TLS
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
    }),
    protocol: 'https'
  }
}

/**
 * Normalizes ingress configuration from user options.
 * Internal helper for createAutoHTTPS.
 *
 * @param host - The host name for the ingress
 * @param options - Optional ingress customization
 * @returns Resolved ingress configuration
 */
function normalizeIngress(host: string, options?: AppIngressOptions): ResolvedIngressConfig {
  return {
    className: options?.className,
    annotations: options?.annotations ? { ...options.annotations } : undefined,
    path: options?.path ?? '/',
    pathType: options?.pathType ?? 'Prefix',
    tls: options?.tls ? options.tls.map((item) => ({ ...item })) : undefined
  }
}

