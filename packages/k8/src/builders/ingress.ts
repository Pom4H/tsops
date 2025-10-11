import type {
  HTTPIngressPath,
  IngressManifest,
  IngressRule,
  ManifestBuilderContext,
  ResolvedIngressConfig
} from '../types.js'
import { createMetadata, DEFAULT_HTTP_PORT } from '../utils.js'

export function buildIngress(
  ctx: ManifestBuilderContext,
  baseLabels: Record<string, string>,
  config: ResolvedIngressConfig
): IngressManifest {
  const host = ctx.host
  if (!host) {
    throw new Error('Ingress requires a host. Provide host() in the config network helper.')
  }

  const metadata = createMetadata(`${ctx.serviceName}-ingress`, ctx.namespace, baseLabels, {
    'nginx.ingress.kubernetes.io/backend-protocol': 'HTTP',
    ...(config.annotations ?? {})
  })

  const path: HTTPIngressPath = {
    path: config.path,
    pathType: config.pathType,
    backend: {
      service: {
        name: ctx.serviceName,
        port: { number: DEFAULT_HTTP_PORT }
      }
    }
  }

  const rules: IngressRule[] = [
    {
      host,
      http: {
        paths: [path]
      }
    }
  ]

  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata,
    spec: {
      ingressClassName: config.className,
      rules,
      tls: config.tls && config.tls.length > 0 ? config.tls : undefined
    }
  }
}
