import type { SecretManifest } from '../types.js'

/**
 * Builds a Secret manifest with opaque data.
 * 
 * @param name - The secret name
 * @param namespace - The namespace where the secret will be created
 * @param data - Key-value pairs to store (will be base64 encoded)
 * @param labels - Optional labels
 * @returns Kubernetes Secret manifest
 * 
 * @example
 * ```typescript
 * const secret = buildSecret('db-credentials', 'prod', {
 *   username: 'admin',
 *   password: 'secret123'
 * }, { app: 'api' })
 * ```
 */
export function buildSecret(
  name: string,
  namespace: string,
  data: Record<string, string>,
  labels?: Record<string, string>
): SecretManifest {
  // Encode values to base64
  const encodedData: Record<string, string> = {}
  for (const [key, value] of Object.entries(data)) {
    encodedData[key] = Buffer.from(value, 'utf-8').toString('base64')
  }

  return {
    apiVersion: 'v1',
    kind: 'Secret',
    type: 'Opaque',
    metadata: {
      name,
      namespace,
      labels: labels ? { ...labels } : undefined
    },
    data: encodedData
  }
}

/**
 * Builds a Secret manifest from string literals (already base64 encoded).
 * Useful when loading from external sources.
 * 
 * @param name - The secret name
 * @param namespace - The namespace where the secret will be created
 * @param stringData - Key-value pairs (plain text, Kubernetes will encode)
 * @param labels - Optional labels
 * @returns Kubernetes Secret manifest
 * 
 * @example
 * ```typescript
 * const secret = buildSecretFromStringData('tls-cert', 'prod', {
 *   'tls.crt': fs.readFileSync('cert.pem', 'utf8'),
 *   'tls.key': fs.readFileSync('key.pem', 'utf8')
 * })
 * ```
 */
export function buildSecretFromStringData(
  name: string,
  namespace: string,
  stringData: Record<string, string>,
  labels?: Record<string, string>
): SecretManifest {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    type: 'Opaque',
    metadata: {
      name,
      namespace,
      labels: labels ? { ...labels } : undefined
    },
    stringData
  }
}

