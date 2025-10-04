import type { ManifestBuilderContext, ServiceManifest, ServicePort } from '../types.js'
import { DEFAULT_HTTP_PORT, createMetadata } from '../utils.js'

export function buildService(
  ctx: ManifestBuilderContext,
  baseLabels: Record<string, string>
): ServiceManifest {
  const metadata = createMetadata(ctx.serviceName, ctx.namespace, baseLabels)

  // Use custom ports if provided, otherwise default to port 80 -> 'http'
  const ports: ServicePort[] = ctx.ports && ctx.ports.length > 0
    ? ctx.ports.map(p => ({
        name: p.name,
        port: p.port,
        targetPort: p.targetPort || p.name,  // Default to named port
        protocol: p.protocol || 'TCP'
      }))
    : [
        {
          name: 'http',
          port: DEFAULT_HTTP_PORT,        // External port (80)
          targetPort: 'http',              // Named port (defined in Deployment)
          protocol: 'TCP'
        }
      ]

  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata,
    spec: {
      selector: baseLabels,
      ports
    }
  }
}
