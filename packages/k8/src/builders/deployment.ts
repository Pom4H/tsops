import type { Container, DeploymentManifest, ManifestBuilderContext, PodSpec } from '../types.js'
import { createEnvVars, createMetadata, DEFAULT_HTTP_PORT } from '../utils.js'

export function buildDeployment(
  appName: string,
  ctx: ManifestBuilderContext,
  baseLabels: Record<string, string>
): DeploymentManifest {
  const metadata = createMetadata(ctx.serviceName, ctx.namespace, baseLabels)

  const envVars = createEnvVars(ctx.env as Record<string, any>)

  // One envFrom entry per secret/configMap reference. Order is preserved so
  // later entries override earlier keys, matching k8s semantics.
  const envFrom = (ctx.envFrom ?? []).map((ref) =>
    ref.__type === 'SecretRef'
      ? { secretRef: { name: ref.secretName } }
      : { configMapRef: { name: ref.configMapName } }
  )

  // Use custom ports if provided, otherwise use PORT env var or default to 80
  const containerPorts =
    ctx.ports && ctx.ports.length > 0
      ? ctx.ports.map((p) => ({
          containerPort: p.containerPort,
          name: p.name,
          protocol: p.protocol || 'TCP'
        }))
      : [
          {
            containerPort:
              typeof ctx.env.PORT === 'string' ? parseInt(ctx.env.PORT, 10) : DEFAULT_HTTP_PORT,
            name: 'http',
            protocol: 'TCP' as const
          }
        ]

  const container: Container = {
    name: appName,
    image: ctx.image,
    imagePullPolicy: 'IfNotPresent',
    ports: containerPorts,
    env: envVars,
    ...(envFrom.length > 0 && { envFrom }),
    resources: {},
    ...(ctx.volumeMounts && { volumeMounts: ctx.volumeMounts }),
    ...(ctx.args && { args: ctx.args })
  }

  const podSpec: PodSpec = {
    containers: [container],
    ...(ctx.volumes && { volumes: ctx.volumes })
  }

  // Grafana needs replicas=1 due to SQLite session storage
  // Other stateful apps should also use replicas=1
  const isStateful =
    appName.toLowerCase().includes('grafana') ||
    appName.toLowerCase().includes('postgres') ||
    appName.toLowerCase().includes('mysql')

  const replicas = isStateful ? 1 : ctx.namespace.toLowerCase().includes('prod') ? 3 : 1

  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata,
    spec: {
      replicas,
      selector: {
        matchLabels: baseLabels
      },
      strategy: {},
      template: {
        metadata: {
          labels: {
            ...baseLabels,
            'app.kubernetes.io/component': appName
          },
          annotations: ctx.podAnnotations
        },
        spec: podSpec
      }
    }
  }
}
