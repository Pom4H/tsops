export type ImageTagStrategy =
  | { type: 'branchName' }
  | { type: 'gitSha'; length?: number }
  | { type: 'semver'; prefix?: string }

export interface ClusterConfig {
  apiServer: string
  context: string
}

export interface MaintenanceWindow {
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
  startUtc: string
  endUtc: string
}

export interface EnvironmentConfig {
  cluster: ClusterConfig
  namespace: string
  imageTagStrategy: ImageTagStrategy
  requiresApproval?: boolean
  maintenanceWindow?: MaintenanceWindow
  kubectlOptions?: {
    dryRun?: boolean
  }
  ingressController?: IngressControllerConfig
  tls?: EnvironmentTlsAutomationConfig
}

export interface ManifestMetadata {
  name: string
  namespace: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface DeploymentManifest {
  apiVersion: 'apps/v1'
  kind: 'Deployment'
  metadata: ManifestMetadata
  spec: {
    replicas: number
    selector: { matchLabels: Record<string, string> }
    template: {
      metadata: {
        labels: Record<string, string>
        annotations?: Record<string, string>
      }
      spec: {
        containers: Array<{
          name: string
          image: string
          command?: string[]
          args?: string[]
          ports?: Array<{ name?: string; containerPort: number }>
          imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never'
          readinessProbe?: Record<string, unknown>
          livenessProbe?: Record<string, unknown>
          resources?: Record<string, unknown>
          env?: Array<
            { name: string; value: string } | { name: string; valueFrom: Record<string, unknown> }
          >
        }>
      }
    }
  }
}

export interface ServiceManifest {
  apiVersion: 'v1'
  kind: 'Service'
  metadata: ManifestMetadata
  spec: {
    selector: Record<string, string>
    ports: Array<{
      name?: string
      port: number
      protocol?: 'TCP' | 'UDP'
      targetPort: number | string
    }>
    type?: 'ClusterIP' | 'NodePort' | 'LoadBalancer'
  }
}

export interface IngressManifest {
  apiVersion: 'networking.k8s.io/v1'
  kind: 'Ingress'
  metadata: ManifestMetadata
  spec: Record<string, unknown>
}

export interface ServiceIngressTLSConfig {
  secretName: string
  hosts: string[]
}

export interface ServiceIngressPathConfig {
  path?: string
  pathType?: 'Prefix' | 'Exact'
  servicePort?: number | string
}

export interface ServiceIngressRuleConfig {
  host: string
  paths: ServiceIngressPathConfig[]
}

export interface ServiceIngressConfig {
  name?: string
  className?: string
  annotations?: Record<string, string>
  entryPoints?: string[]
  tls?: ServiceIngressTLSConfig[]
  rules: ServiceIngressRuleConfig[]
}

export interface SelfSignedTlsConfig {
  enabled: boolean
  keySize?: number
  validDays?: number
}

export interface EnvironmentTlsAutomationConfig {
  selfSigned?: SelfSignedTlsConfig
}

export interface IngressControllerConfig {
  type: 'traefik'
  namespace?: string
  autoInstall?: boolean
  serviceType?: 'LoadBalancer' | 'NodePort' | 'ClusterIP'
}

export type KubernetesManifest =
  | DeploymentManifest
  | ServiceManifest
  | IngressManifest
  | Record<string, unknown>

export interface EnvironmentRuntimeInfo {
  name: string
  namespace: string
}

export interface ServiceManifestContext {
  env: EnvironmentRuntimeInfo
  image: string
}

export interface ServiceConfig {
  containerImage: string
  defaultEnvironment?: string
  releaseName?: string
  dependsOn?: string[]
  rollout?: {
    strategy: 'rolling'
    maxUnavailable?: number | string
    maxSurge?: number | string
  }
  manifests: (context: ServiceManifestContext) => KubernetesManifest[]
  envOverrides?: Record<
    string,
    {
      manifests?: (context: ServiceManifestContext) => KubernetesManifest[]
    }
  >
  ingress?: Record<string, ServiceIngressConfig>
}

export interface ExecOptions {
  env?: Record<string, string>
}

export type ExecFn = (command: string, options?: ExecOptions) => Promise<void>

export interface KubectlApplyOptions {
  context: string
  namespace: string
  manifests: KubernetesManifest[]
}

export interface KubectlDiffOptions extends KubectlApplyOptions {}

export interface KubectlRolloutStatusOptions {
  context: string
  namespace: string
  workload: string
  timeoutSeconds?: number
}

export interface KubectlExecOptions {
  context: string
  namespace: string
  podSelector: Record<string, string>
  container: string
  command: string[]
}

export interface KubectlClient {
  apply(options: KubectlApplyOptions): Promise<void>
  diff(options: KubectlDiffOptions): Promise<void>
  rolloutStatus(options: KubectlRolloutStatusOptions): Promise<void>
  exec(options: KubectlExecOptions): Promise<void>
}

export interface GitInfo {
  branch: string
  sha: string
  shortSha: string
  tag?: string
  hasUncommittedChanges: boolean
}

export interface BuildContext {
  exec: ExecFn
  env: Record<string, string>
  service: ServiceRuntime
  environment: EnvironmentRuntimeInfo
  git: GitInfo
}

export interface TestContext {
  exec: ExecFn
  git: GitInfo
}

export interface DeployContext {
  kubectl: KubectlClient
  environment: EnvironmentConfig & { name: string }
  service: ServiceRuntime
  config: TsOpsConfig
  git: GitInfo
  manifests: KubernetesManifest[]
}

export interface ServiceRuntime {
  name: string
  releaseName?: string
  containerImage: string
}

export interface BuildPipelineConfig {
  run: (ctx: BuildContext) => Promise<void>
  artifacts?: Array<{
    source: string
    include?: string[]
  }>
  publishImage?: {
    registry: string
    tagTemplate: (input: {
      service: ServiceRuntime
      environment: EnvironmentRuntimeInfo
      git: GitInfo
    }) => string
  }
}

export interface TestPipelineConfig {
  run: (ctx: TestContext) => Promise<void>
  coverageThreshold?: number
}

export interface DeployPipelineConfig {
  defaultStrategy?: {
    type: 'rolling'
    maxUnavailable?: number | string
    maxSurge?: number | string
  }
  strategies?: Record<string, Record<string, unknown>>
  run: (ctx: {
    kubectl: KubectlClient
    environment: EnvironmentConfig & { name: string }
    service: ServiceRuntime
    config: TsOpsConfig
    git: GitInfo
    manifests: KubernetesManifest[]
  }) => Promise<void>
  diff?: (ctx: {
    kubectl: KubectlClient
    environment: EnvironmentConfig & { name: string }
    manifests: KubernetesManifest[]
  }) => Promise<void>
}

export interface PipelineConfig {
  build: BuildPipelineConfig
  test: TestPipelineConfig
  deploy: DeployPipelineConfig
}

export interface SecretProviderConfig {
  type: 'vault'
  connection: Record<string, unknown>
}

export interface SecretMapEntry {
  path: string
  key: string
}

export interface SecretsConfig {
  provider: SecretProviderConfig
  map: Record<string, SecretMapEntry>
}

export interface NotificationTemplateArgs {
  service: ServiceRuntime
  environment: EnvironmentRuntimeInfo
  git: GitInfo
  error?: unknown
}

export interface NotificationChannelConfig {
  webhookSecret: string
  channel: string
  templates: {
    success: (args: NotificationTemplateArgs) => string
    failure: (args: NotificationTemplateArgs) => string
  }
}

export interface NotificationsConfig {
  channels: Record<string, NotificationChannelConfig>
  onEvents: Record<string, string[]>
}

export interface HookContext {
  exec: ExecFn
  kubectl: KubectlClient
  git: GitInfo
  environment: EnvironmentConfig & { name: string }
  service: ServiceRuntime
}

export type Hook = (ctx: Partial<HookContext>) => Promise<void>

export interface HooksConfig {
  beforeDeploy?: Hook[]
  afterDeploy?: Hook[]
  onFailure?: Hook[]
}

export interface ObservabilityConfig {
  dashboards?: Array<{ name: string; url: string }>
  alerts?: Array<{ id: string; severity: 'low' | 'medium' | 'high'; escalateAfterMinutes?: number }>
}

export interface ProjectConfig {
  name: string
  repoUrl: string
  defaultBranch: string
}

export interface ServicesConfig {
  [serviceName: string]: ServiceConfig
}

export interface EnvironmentsConfig {
  [envName: string]: EnvironmentConfig
}

export interface TsOpsConfigHelpers {
  renderManifests?: (input: {
    environment: EnvironmentConfig & { name: string }
    service: ServiceConfig & { name: string }
    imageTag: string
  }) => KubernetesManifest[]
  buildImageTag?: (
    service: ServiceConfig & { name: string },
    environment: EnvironmentConfig & { name: string },
    git: GitInfo
  ) => string
}

export interface TsOpsConfig extends TsOpsConfigHelpers {
  project: ProjectConfig
  environments: EnvironmentsConfig
  services: ServicesConfig
  pipeline: PipelineConfig
  secrets: SecretsConfig
  notifications: NotificationsConfig
  hooks?: HooksConfig
  featureFlags?: Record<string, unknown>
}

export interface Logger {
  info(message: string): void
  warn(message: string): void
  error(message: string, error?: unknown): void
  debug?(message: string): void
}
