import type {
  IngressRouteManifest,
  ManifestBuilderContext,
  ResolvedIngressRouteConfig
} from '../types.js'
import { DEFAULT_HTTP_PORT, createMetadata } from '../utils.js'

export function buildIngressRoute(
  ctx: ManifestBuilderContext,
  baseLabels: Record<string, string>,
  config: ResolvedIngressRouteConfig
): IngressRouteManifest {
  const metadata = createMetadata(
    `${ctx.serviceName}-ingressroute`,
    ctx.namespace,
    baseLabels
  )

  const routes = config.routes.map((route) => {
    const services =
      route.services.length > 0
        ? route.services
        : [
            {
              name: ctx.serviceName,
              port: DEFAULT_HTTP_PORT,
              kind: 'Service' as const
            }
          ]

    return {
      kind: 'Rule' as const,
      match: route.match,
      priority: route.priority,
      middlewares: route.middlewares,
      services: services.map((service) => ({
        kind: service.kind ?? 'Service',
        name: service.name,
        namespace: service.namespace,
        scheme: service.scheme,
        port: service.port,
        nativeLB: service.nativeLB,
        nodePortLB: service.nodePortLB,
        passHostHeader: service.passHostHeader,
        serversTransport: service.serversTransport
      }))
    }
  })

  return {
    apiVersion: 'traefik.io/v1alpha1',
    kind: 'IngressRoute',
    metadata,
    spec: {
      entryPoints: config.entryPoints,
      routes,
      tls: config.tls
    }
  }
}
