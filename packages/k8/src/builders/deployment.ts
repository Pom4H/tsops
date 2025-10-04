import type { DeploymentManifest, ManifestBuilderContext, PodSpec, Container } from '../types.js'
import { DEFAULT_HTTP_PORT, createEnvVars, createMetadata } from '../utils.js'

export function buildDeployment(
  appName: string,
  ctx: ManifestBuilderContext,
  baseLabels: Record<string, string>
): DeploymentManifest {
  const metadata = createMetadata(ctx.serviceName, ctx.namespace, baseLabels)
  // Support two env shapes:
  // - Record<string, EnvValue>: individual envs and keyRefs
  // - SecretRef/ConfigMapRef: envFrom for entire secret/configMap
  const isObject = ctx.env && typeof ctx.env === 'object'
  const isSecretRef = isObject && (ctx.env as any).__type === 'SecretRef'
  const isConfigMapRef = isObject && (ctx.env as any).__type === 'ConfigMapRef'

  const envFrom = isSecretRef
    ? [{ secretRef: { name: (ctx.env as any).secretName } }]
    : isConfigMapRef
    ? [{ configMapRef: { name: (ctx.env as any).configMapName } }]
    : undefined

  const envVars = !envFrom ? createEnvVars(ctx.env) : []

  // Use custom ports if provided, otherwise use PORT env var or default to 80
  const containerPorts = ctx.ports && ctx.ports.length > 0
    ? ctx.ports.map(p => ({
        containerPort: typeof p.targetPort === 'number' ? p.targetPort : (p.port),
        name: p.name,
        protocol: p.protocol || 'TCP'
      }))
    : [
        {
          containerPort: ctx.env.PORT ? parseInt(ctx.env.PORT, 10) : DEFAULT_HTTP_PORT,
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
    ...(envFrom && { envFrom }),
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
  const isStateful = appName.toLowerCase().includes('grafana') || 
                     appName.toLowerCase().includes('postgres') ||
                     appName.toLowerCase().includes('mysql')
  
  const replicas = isStateful ? 1 : (ctx.namespace.toLowerCase().includes('prod') ? 3 : 1)

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
