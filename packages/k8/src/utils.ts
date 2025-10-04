import type { EnvVar, ObjectMeta } from './types.js'

export const DEFAULT_HTTP_PORT = 80

export function createMetadata(
  name: string,
  namespace: string,
  labels: Record<string, string>,
  annotations?: Record<string, string>
): ObjectMeta {
  const metadata: ObjectMeta = { name, namespace }

  if (Object.keys(labels).length > 0) {
    metadata.labels = { ...labels }
  }

  if (annotations && Object.keys(annotations).length > 0) {
    metadata.annotations = { ...annotations }
  }

  return metadata
}

interface SecretRef {
  readonly __type: 'SecretRef'
  readonly secretName: string
  readonly key?: string
}

interface ConfigMapRef {
  readonly __type: 'ConfigMapRef'
  readonly configMapName: string
  readonly key?: string
}

type EnvValue = string | SecretRef | ConfigMapRef

function isSecretRef(value: any): value is SecretRef {
  return value && typeof value === 'object' && value.__type === 'SecretRef'
}

function isConfigMapRef(value: any): value is ConfigMapRef {
  return value && typeof value === 'object' && value.__type === 'ConfigMapRef'
}

export function createEnvVars(env: Record<string, EnvValue>): EnvVar[] {
  const entries: EnvVar[] = []
  for (const [name, value] of Object.entries(env)) {
    if (isSecretRef(value)) {
      // Missing key means use env var name as the key by convention
      const keyName = value.key || name
      entries.push({
        name,
        valueFrom: {
          secretKeyRef: {
            name: value.secretName,
            key: keyName
          }
        }
      })
    } else if (isConfigMapRef(value)) {
      // Missing key means use env var name as the key by convention
      const keyName = value.key || name
      entries.push({
        name,
        valueFrom: {
          configMapKeyRef: {
            name: value.configMapName,
            key: keyName
          }
        }
      })
    } else {
      // Regular string value
      entries.push({ name, value: String(value) })
    }
  }
  return entries
}
