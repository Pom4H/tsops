import type { NamespaceManifest } from '../types.js'

/**
 * Builds a Namespace manifest.
 *
 * @param name - The namespace name
 * @param labels - Labels to apply to the namespace
 * @returns Kubernetes Namespace manifest
 *
 * @example
 * ```typescript
 * const ns = buildNamespace('prod', { environment: 'production' })
 * ```
 */
export function buildNamespace(name: string, labels?: Record<string, string>): NamespaceManifest {
  return {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name,
      labels: labels ? { ...labels } : undefined
    }
  }
}
