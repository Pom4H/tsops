import type { ConfigMapManifest } from '../types.js'

/**
 * Builds a ConfigMap manifest.
 *
 * @param name - The ConfigMap name
 * @param namespace - The namespace where the ConfigMap will be created
 * @param data - Key-value pairs to store
 * @param labels - Optional labels
 * @returns Kubernetes ConfigMap manifest
 *
 * @example
 * ```typescript
 * const cm = buildConfigMap('app-config', 'prod', {
 *   'app.conf': 'key=value\nfoo=bar',
 *   'API_URL': 'https://api.example.com'
 * }, { app: 'api' })
 * ```
 */
export function buildConfigMap(
  name: string,
  namespace: string,
  data: Record<string, string>,
  labels?: Record<string, string>
): ConfigMapManifest {
  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name,
      namespace,
      labels: labels ? { ...labels } : undefined
    },
    data: { ...data }
  }
}
