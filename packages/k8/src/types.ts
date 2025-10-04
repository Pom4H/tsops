import type { components } from './generated/k8s-openapi.js'

type Schemas = components['schemas']

type RawDeployment = Schemas['io.k8s.api.apps.v1.Deployment']
type RawService = Schemas['io.k8s.api.core.v1.Service']
type RawIngress = Schemas['io.k8s.api.networking.v1.Ingress']
type RawNamespace = Schemas['io.k8s.api.core.v1.Namespace']
type RawSecret = Schemas['io.k8s.api.core.v1.Secret']
type RawConfigMap = Schemas['io.k8s.api.core.v1.ConfigMap']
type RawIngressRoute = Schemas['io.traefik.v1alpha1.IngressRoute']
type RawCertificate = Schemas['io.cert-manager.v1.Certificate']

type PodSpec = Schemas['io.k8s.api.core.v1.PodSpec']
type Container = Schemas['io.k8s.api.core.v1.Container']
type EnvVar = Schemas['io.k8s.api.core.v1.EnvVar']
type ServicePort = Schemas['io.k8s.api.core.v1.ServicePort']
type IngressRule = Schemas['io.k8s.api.networking.v1.IngressRule']
type HTTPIngressPath = Schemas['io.k8s.api.networking.v1.HTTPIngressPath']
type IngressTLS = Schemas['io.k8s.api.networking.v1.IngressTLS']
type IngressRouteSpec = RawIngressRoute['spec']
type IngressRouteMiddlewareRef = NonNullable<
  IngressRouteSpec['routes'][number]['middlewares']
>[number]
type IngressRouteService = NonNullable<IngressRouteSpec['routes'][number]['services']>[number]
type IngressRouteTLS = IngressRouteSpec['tls']
type CertificateSpec = NonNullable<RawCertificate['spec']>
type CertificateIssuerRef = CertificateSpec['issuerRef']
type ObjectMeta = Schemas['io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta']

type DeploymentStatus = RawDeployment['status']
type ServiceStatus = RawService['status']
type IngressStatus = RawIngress['status']
type NamespaceStatus = RawNamespace['status']

type NonNull<T> = T extends null | undefined ? never : T

type WithoutStatus<TManifest, TStatus> = Omit<TManifest, 'status'> & { status?: TStatus }

export type DeploymentManifest = WithoutStatus<RawDeployment, DeploymentStatus>
export type ServiceManifest = WithoutStatus<RawService, ServiceStatus>
export type IngressManifest = WithoutStatus<RawIngress, IngressStatus>
export type NamespaceManifest = Omit<RawNamespace, 'status' | 'spec'> & { status?: NamespaceStatus; spec?: RawNamespace['spec'] }
export type SecretManifest = RawSecret
export type ConfigMapManifest = RawConfigMap
export type IngressRouteManifest = RawIngressRoute
export type CertificateManifest = RawCertificate

export interface ResolvedIngressConfig {
  className?: string
  annotations?: Record<string, string>
  path: string
  pathType: HTTPIngressPath['pathType']
  tls?: IngressTLS[]
}

export interface ResolvedIngressRouteServiceConfig
  extends Partial<Pick<IngressRouteService, 'namespace' | 'scheme' | 'kind' | 'serversTransport'>> {
  name: string
  port?: IngressRouteService['port']
  nativeLB?: IngressRouteService['nativeLB']
  nodePortLB?: IngressRouteService['nodePortLB']
  passHostHeader?: IngressRouteService['passHostHeader']
}

export interface ResolvedIngressRouteRouteConfig {
  match: string
  priority?: number
  middlewares?: IngressRouteMiddlewareRef[]
  services: ResolvedIngressRouteServiceConfig[]
}

export interface ResolvedIngressRouteConfig {
  entryPoints?: IngressRouteSpec['entryPoints']
  routes: ResolvedIngressRouteRouteConfig[]
  tls?: IngressRouteTLS
}

export interface ResolvedCertificateConfig
  extends Partial<Omit<CertificateSpec, 'issuerRef' | 'dnsNames' | 'secretName'>> {
  secretName: string
  issuerRef: CertificateIssuerRef
  dnsNames: string[]
  commonName?: CertificateSpec['commonName']
}

export interface ResolvedNetworkConfig {
  ingress?: ResolvedIngressConfig
  ingressRoute?: ResolvedIngressRouteConfig
  certificate?: ResolvedCertificateConfig
}

export interface ManifestSet {
  deployment: DeploymentManifest
  service: ServiceManifest
  ingress?: IngressManifest
  ingressRoute?: IngressRouteManifest
  certificate?: CertificateManifest
}

export interface ManifestBuilderContext {
  namespace: string
  serviceName: string
  image: string
  host?: string
  env: any  // Can be Record<string, string> or Record<string, EnvValue> or SecretRef or ConfigMapRef
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

export type {
  PodSpec,
  Container,
  EnvVar,
  ServicePort,
  IngressRule,
  HTTPIngressPath,
  IngressTLS,
  IngressRouteMiddlewareRef,
  IngressRouteService,
  IngressRouteTLS,
  CertificateSpec,
  CertificateIssuerRef,
  ObjectMeta
}
