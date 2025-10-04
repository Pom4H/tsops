import type { ResolvedNetworkConfig } from '@tsops/k8'
import type { EnvValue, SecretRef, ConfigMapRef } from '../types.js'

export interface EnvFromSource {
  type: 'secret' | 'configMap'
  name: string
}

export interface PlanEntry {
  namespace: string
  app: string
  host?: string
  image: string
  env: Record<string, EnvValue> | SecretRef | ConfigMapRef
  envFrom?: EnvFromSource[]
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
    port: number
    targetPort?: number | string
    protocol?: 'TCP' | 'UDP'
  }>
}

export interface PlanResult {
  entries: PlanEntry[]
}

export interface BuildResult {
  images: { app: string; image: string }[]
}

export interface DeployResult {
  entries: (PlanEntry & { appliedManifests: string[] })[]
}

export interface ManifestChange {
  kind: string
  name: string
  namespace: string
  action: 'create' | 'update' | 'unchanged'
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
}
