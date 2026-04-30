import type { ResolvedNetworkConfig } from '@tsops/k8'
import type { ConfigMapRef, EnvValue, SecretRef } from '../types.js'

export interface PlanEntry {
  namespace: string
  app: string
  host?: string
  image: string
  env: Record<string, EnvValue>
  envFrom: Array<SecretRef | ConfigMapRef>
  /** Other apps this app declared as dependencies (from `app.needs`). */
  needs?: readonly string[]
  secrets: Record<string, Record<string, string>>
  configMaps: Record<string, Record<string, string>>
  network?: ResolvedNetworkConfig
  podAnnotations?: Record<string, string>
  volumes?: Array<{
    name: string
    configMap?: { name: string }
    secret?: { secretName: string }
    emptyDir?: Record<string, unknown>
    persistentVolumeClaim?: { claimName: string }
  }>
  volumeMounts?: Array<{
    name: string
    mountPath: string
    readOnly?: boolean
    subPath?: string
  }>
  args?: string[]
  ports?: Array<{
    name: string
    /** k8s Service port (what other services dial). */
    port: number
    /** Pod port the Service forwards to (named or numeric). */
    targetPort: number | string
    /** Numeric container port for the Deployment manifest. */
    containerPort: number
    /** Optional port for `runtime: 'local'` namespaces. */
    localPort?: number
    protocol?: 'TCP' | 'UDP'
  }>
  /**
   * When set, this entry is a stub: instead of a Deployment, the deployer
   * emits a `Service: ExternalName` in `entry.namespace` (the overlay) that
   * points at the same app in `fallback.namespace` (the base / static
   * namespace) via cluster DNS. Optional ingress resources are still emitted
   * so the app remains reachable on the overlay's domain.
   *
   * Produced when an overlay deploys with `--include` and this app isn't in
   * the include list.
   */
  fallback?: {
    /** Static namespace whose `<svc>.<ns>.svc.cluster.local` we proxy to. */
    namespace: string
  }
}

export interface PlanResult {
  entries: PlanEntry[]
  /**
   * Non-fatal findings (e.g. sensitive-env warnings). Empty when no validation
   * is configured. When `validation.sensitiveEnv.mode` is `'error'`, the
   * planner throws instead and this array is unused.
   */
  warnings?: import('../validation/sensitive-env.js').SensitiveEnvFinding[]
  /**
   * Dependency graph per namespace. Present only when at least one app in
   * that namespace declared `needs`.
   */
  dependencies?: Record<
    string,
    {
      graph: import('../dependencies/graph.js').DependencyGraph
      order: string[]
    }
  >
}

export interface BuildResult {
  images: { app: string; image: string }[]
}

export interface DeployResult {
  entries: (PlanEntry & { appliedManifests: string[] })[]
  deletedManifests?: string[]
}

export interface ManifestChange {
  kind: string
  name: string
  namespace: string
  action: 'create' | 'update' | 'unchanged' | 'delete'
  diff?: string
  validated: boolean
  validationError?: string
}

export interface GlobalArtifacts {
  namespaces: ManifestChange[]
  secrets: ManifestChange[]
  configMaps: ManifestChange[]
}

export interface AppResourceChanges {
  app: string
  namespace: string
  image: string
  host?: string
  changes: ManifestChange[]
}

export interface PlanWithChangesResult {
  global: GlobalArtifacts
  apps: AppResourceChanges[]
  orphaned: ManifestChange[]
}
