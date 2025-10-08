import type {
  CertificateManifest,
  ConfigMapManifest,
  DeploymentManifest,
  IngressManifest,
  IngressRouteManifest,
  NamespaceManifest,
  SecretManifest,
  ServiceManifest
} from '@tsops/k8'

export type SupportedManifest =
  | NamespaceManifest
  | SecretManifest
  | ConfigMapManifest
  | DeploymentManifest
  | ServiceManifest
  | IngressManifest
  | IngressRouteManifest
  | CertificateManifest

export interface ApplyManifestOptions {
  namespace: string
}

export interface KubectlClient {
  apply(manifest: SupportedManifest, options: ApplyManifestOptions): Promise<string>
  applyBatch(manifests: SupportedManifest[], options: ApplyManifestOptions): Promise<string[]>
  secretExists(secretName: string, namespace: string): Promise<boolean>
  getSecretData(secretName: string, namespace: string): Promise<Record<string, string> | null>
  validate(
    manifest: SupportedManifest,
    options: ApplyManifestOptions,
    useClientSide?: boolean
  ): Promise<boolean>
  get(kind: string, name: string, namespace: string): Promise<SupportedManifest | null>
  diff(manifest: SupportedManifest, options: ApplyManifestOptions): Promise<string | null>
  list(kind: string, namespace: string, labelSelector?: string): Promise<SupportedManifest[]>
  delete(kind: string, name: string, namespace: string): Promise<string>
}
