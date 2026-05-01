import type { ServiceManifest } from '../types.js'
import { createMetadata } from '../utils.js'

/**
 * Build a `Service: ExternalName` that proxies traffic to the same service in
 * a fallback namespace via cluster DNS. Used by overlay namespaces (e.g. PR
 * previews) to transparently route apps that were not in `--include`.
 */
export function buildExternalNameService(options: {
  serviceName: string
  namespace: string
  fallbackNamespace: string
  baseLabels: Record<string, string>
  ports?: Array<{ name: string; port: number; protocol?: 'TCP' | 'UDP' }>
  clusterDomain?: string
}): ServiceManifest {
  const {
    serviceName,
    namespace,
    fallbackNamespace,
    baseLabels,
    ports,
    clusterDomain = 'cluster.local'
  } = options

  const metadata = createMetadata(serviceName, namespace, {
    ...baseLabels,
    'tsops/fallback': fallbackNamespace
  })

  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata,
    spec: {
      type: 'ExternalName',
      externalName: `${serviceName}.${fallbackNamespace}.svc.${clusterDomain}`,
      ports:
        ports && ports.length > 0
          ? ports.map((p) => ({ name: p.name, port: p.port, protocol: p.protocol ?? 'TCP' }))
          : undefined
    }
  }
}
