import type {
  CertificateIssuerRef,
  CertificateSpec,
  HTTPIngressPath,
  IngressRouteManifest,
  IngressRouteMiddlewareRef,
  IngressRouteService,
  IngressRouteTLS,
  IngressTLS
} from '@tsops/k8'

type IngressRouteSpec = IngressRouteManifest['spec']

export type TagStrategy =
  | 'git-sha'
  | 'git-tag'
  | 'timestamp'
  | { kind: string; [key: string]: unknown }
  | (string & Record<never, never>)

/**
 * Namespace definition - can contain any custom variables.
 * All namespaces in config must have the same shape (consistent structure).
 */
export type NamespaceDefinition = Record<string, unknown>

/**
 * Reserved context keys that cannot be used as namespace variables.
 * These are built-in helper functions and metadata.
 */
type ReservedContextKeys =
  | 'project'
  | 'namespace'
  | 'dns'
  | 'url'
  | 'serviceName'
  | 'secret'
  | 'configMap'
  | 'secretKey'
  | 'configMapKey'
  | 'service'

/**
 * Validate that namespace variables don't use reserved names
 */
export type ValidateNamespaceVars<T extends Record<string, unknown>> = Extract<
  keyof T,
  ReservedContextKeys
> extends never
  ? T
  : {
      __error: 'Namespace variables cannot use reserved context names'
      __conflicts: Extract<keyof T, ReservedContextKeys>
    }

export type ClusterDefinition<TNamespaceName extends string> = {
  apiServer: string
  context: string
  namespaces: readonly TNamespaceName[]
} & Record<string, unknown>

/**
 * Docker cache backend configuration for BuildKit
 * @see https://docs.docker.com/build/cache/backends/
 */
export type DockerCacheConfig =
  | {
      type: 'registry'
      /** Registry cache reference (e.g., 'ghcr.io/org/repo:cache' or 'type=registry,ref=...') */
      ref?: string
      mode?: 'min' | 'max'
      /** Enable inline cache export */
      inline?: boolean
    }
  | {
      type: 'gha'
      /** GitHub Actions cache token */
      token?: string
      /** GitHub Actions cache scope */
      scope?: string
    }
  | {
      type: 's3'
      bucket: string
      region?: string
      prefix?: string
    }
  | {
      type: 'local'
      dest?: string
    }
  | {
      type: 'inline'
    }

export type ImagesConfig = {
  registry: string
  tagStrategy: TagStrategy
  repository?: string
  includeProjectInName?: boolean
  /**
   * Default cache configuration for all apps.
   * Can be overridden per app in build.cache.
   */
  cache?: DockerCacheConfig
} & Record<string, unknown>

/**
 * Build context passed to platform functions.
 * Can contain any custom variables from namespace.
 */
export type AppBuildContext = Record<string, unknown>

export type DockerfileBuild = {
  type: 'dockerfile'
  context: string
  dockerfile: string
  platform?: string | ((ctx: AppBuildContext) => string)
  env?: Record<string, string>
  args?: Record<string, string>
  target?: string
  /**
   * Cache configuration for this specific build.
   * Overrides global images.cache if provided.
   */
  cache?: DockerCacheConfig | false
} & Record<string, unknown>

export type GenericBuild = Record<string, unknown>

export type BuildDefinition = DockerfileBuild | GenericBuild

/**
 * Extract secret names from secrets map (like DomainKey for domain)
 */
export type SecretKey<TSecrets> = NonNullable<TSecrets> extends Record<string, unknown>
  ? Extract<keyof NonNullable<TSecrets>, string>
  : string

/**
 * Extract configMap names from configMaps map (like DomainKey for domain)
 */
export type ConfigMapKey<TConfigMaps> = NonNullable<TConfigMaps> extends Record<string, unknown>
  ? Extract<keyof NonNullable<TConfigMaps>, string>
  : string

/**
 * Extract app names from apps map
 */
export type AppKey<TApps> = NonNullable<TApps> extends Record<string, unknown>
  ? Extract<keyof NonNullable<TApps>, string>
  : string

/**
 * Infer value keys for a given secret name from TSecrets map.
 * Supports both object and function-based secret definitions.
 */
export type SecretValueKeys<
  TSecrets,
  TName extends SecretKey<TSecrets>
> = NonNullable<TSecrets> extends Record<string, unknown>
  ? NonNullable<TSecrets>[TName] extends (...args: never[]) => infer R
    ? R extends Record<string, string>
      ? Extract<keyof R, string>
      : string
    : NonNullable<TSecrets>[TName] extends Record<string, string>
      ? Extract<keyof NonNullable<TSecrets>[TName], string>
      : string
  : string

/**
 * Infer value keys for a given configMap name from TConfigMaps map.
 * Supports both object and function-based configMap definitions.
 */
export type ConfigMapValueKeys<
  TConfigMaps,
  TName extends ConfigMapKey<TConfigMaps>
> = NonNullable<TConfigMaps> extends Record<string, unknown>
  ? NonNullable<TConfigMaps>[TName] extends (...args: never[]) => infer R
    ? R extends Record<string, string>
      ? Extract<keyof R, string>
      : string
    : NonNullable<TConfigMaps>[TName] extends Record<string, string>
      ? Extract<keyof NonNullable<TConfigMaps>[TName], string>
      : string
  : string

/**
 * Special marker type for secret references in env definitions
 */
export interface SecretRef {
  readonly __type: 'SecretRef'
  readonly secretName: string
  readonly key?: string
}

/**
 * Special marker type for configMap references in env definitions
 */
export interface ConfigMapRef {
  readonly __type: 'ConfigMapRef'
  readonly configMapName: string
  readonly key?: string
}

/**
 * Type guard to check if value is a SecretRef
 */
export function isSecretRef(value: unknown): value is SecretRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__type' in value &&
    (value as Record<string, unknown>).__type === 'SecretRef'
  )
}

/**
 * Type guard to check if value is a ConfigMapRef
 */
export function isConfigMapRef(value: unknown): value is ConfigMapRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__type' in value &&
    (value as Record<string, unknown>).__type === 'ConfigMapRef'
  )
}

/**
 * Type guard to check if value is an envFrom reference (entire secret/configMap)
 */
export function isEnvFromRef(value: unknown): value is SecretRef | ConfigMapRef {
  return isSecretRef(value) || isConfigMapRef(value)
}

/**
 * Environment value can be:
 * - Static string
 * - Secret reference (for valueFrom.secretKeyRef)
 * - ConfigMap reference (for valueFrom.configMapKeyRef)
 */
export type EnvValue = string | SecretRef | ConfigMapRef

/**
 * Extract secret names from app's secrets definition
 */
export type ExtractSecretNames<T> = T extends Record<string, Record<string, string>>
  ? Extract<keyof T, string>
  : T extends (ctx: never) => infer R
    ? R extends Record<string, Record<string, string>>
      ? Extract<keyof R, string>
      : string
    : string

/**
 * Extract configMap names from app's configMaps definition
 */
export type ExtractConfigMapNames<T> = T extends Record<string, Record<string, string>>
  ? Extract<keyof T, string>
  : T extends (ctx: never) => infer R
    ? R extends Record<string, Record<string, string>>
      ? Extract<keyof R, string>
      : string
    : string

/**
 * Cluster metadata available in context
 */
export interface ClusterMetadata {
  /** Cluster name */
  name: string
  /** API server URL */
  apiServer: string
  /** Kubectl context name */
  context: string
}

/**
 * DNS type for dns helper function
 */
export type DNSType = 'cluster' | 'service' | 'ingress'

/**
 * Options for dns helper function
 */
export interface DNSOptions {
  /** Port number */
  port?: number
  /** Protocol prefix (http, https, tcp, udp) */
  protocol?: 'http' | 'https' | 'tcp' | 'udp'
  /** Generate headless service DNS (for StatefulSets) */
  headless?: boolean
  /** Pod index for headless service */
  podIndex?: number
  /** External service (no namespace/cluster domain) */
  external?: boolean
  /** Custom cluster domain (default: cluster.local) */
  clusterDomain?: string
  /** External host for ingress type (overrides context externalHost) */
  externalHost?: string
}

/**
 * Kubernetes resource kinds for resource name generation
 */
export type ResourceKind = 'secret' | 'configmap' | 'pvc' | 'sa' | 'serviceaccount'

/**
 * Core helper functions available in all app configuration resolvers.
 * These functions provide access to project metadata and utilities
 * for generating Kubernetes resource names.
 */
export interface AppContextCoreHelpers<
  TProject extends string,
  TNamespaceName extends string,
  TSecretNames extends string = string,
  TConfigMapNames extends string = string,
  TSecrets = undefined,
  TConfigMaps = undefined,
  TApps = undefined,
  TAppNames extends string = AppKey<TApps>
> {
  // ============================================================================
  // METADATA
  // ============================================================================

  /** Current project name from config */
  project: TProject

  /** Current namespace name */
  namespace: TNamespaceName

  /** Current app name being configured */
  appName: string

  /** Current cluster metadata */
  cluster: ClusterMetadata

  // ============================================================================
  // GENERATORS
  // ============================================================================

  /**
   * Generate DNS name for different types of resources
   * @param app - Application name (type-safe from config.apps)
   * @param type - DNS type: 'cluster' for internal cluster DNS, 'service' for service name, 'ingress' for external DNS
   * @returns DNS name
   * @example
   * // Cluster internal DNS
   * dns('api', 'cluster') // -> 'api.my-namespace.svc.cluster.local'
   *
   * // Service name only
   * dns('api', 'service') // -> 'api'
   *
   * // External DNS (resolved from ingress configuration)
   * dns('api', 'ingress') // -> 'api.example.com' (if ingress configured)
   *
   * // Usage in env:
   * env: ({ dns }) => ({
   *   BACKEND_URL: `https://${dns('backend', 'ingress')}`
   * })
   */
  dns: (app: TAppNames, type: DNSType) => string

  /**
   * Generate complete URL for different types of resources with automatic port resolution
   * @param app - Application name (type-safe from config.apps)
   * @param type - URL type: 'cluster' for internal cluster URL, 'service' for service URL, 'ingress' for external URL
   * @param options - Optional URL options
   * @returns Complete URL with protocol and port
   * @example
   * // Cluster internal URL (uses first port from app.ports)
   * url('api', 'cluster') // -> 'http://api.my-namespace.svc.cluster.local:3000'
   *
   * // Service URL (uses first port from app.ports)
   * url('api', 'service') // -> 'http://api:3000'
   *
   * // External URL (uses ingress configuration, HTTPS without port by default)
   * url('api', 'ingress') // -> 'https://api.example.com' (if ingress configured)
   *
   * // With custom protocol
   * url('api', 'cluster', { protocol: 'https' }) // -> 'https://api.my-namespace.svc.cluster.local:3000'
   *
   * // Usage in env:
   * env: ({ url }) => ({
   *   BACKEND_URL: url('backend', 'ingress'),
   *   API_URL: url('api', 'cluster')
   * })
   */
  url: (app: TAppNames, type: DNSType, options?: { protocol?: 'http' | 'https' }) => string

  /**
   * Generate Kubernetes label selector
   * @param key - Label key (will be prefixed with app.kubernetes.io/)
   * @param value - Optional label value (defaults to app name)
   * @returns Label selector string
   * @example
   * label('name') // -> 'app.kubernetes.io/name=api'
   * label('component', 'database') // -> 'app.kubernetes.io/component=database'
   */
  label: (key: string, value?: string) => string

  /**
   * Generate resource name following project conventions
   * @param kind - Resource kind
   * @param name - Resource name suffix
   * @returns Full resource name
   * @example
   * resource('secret', 'api-keys') // -> 'api-api-keys'
   * resource('pvc', 'data') // -> 'api-data'
   */
  resource: (kind: ResourceKind, name: string) => string

  // ============================================================================
  // SECRETS & CONFIGMAPS
  // ============================================================================

  /**
   * Reference entire secret as envFrom or specific key
   * @param secretName - Name of the secret (type-safe based on declared secrets)
   * @param key - Optional key within the secret (type-safe based on secret definition)
   * @returns SecretRef marker for deployment builder
   * @example
   * // Reference entire secret (envFrom)
   * env: ({ secret }) => secret('api-secrets')
   * // Generates: envFrom: [{ secretRef: { name: 'api-secrets' } }]
   *
   * // Reference specific key (valueFrom)
   * env: ({ secret }) => ({
   *   JWT_SECRET: secret('api-secrets', 'JWT_SECRET')
   * })
   * // Generates: env: [{ name: 'JWT_SECRET', valueFrom: { secretKeyRef: { name: 'api-secrets', key: 'JWT_SECRET' } } }]
   */
  secret: {
    (secretName: TSecretNames): SecretRef
    <TName extends SecretKey<TSecrets>>(
      secretName: TName,
      key: SecretValueKeys<TSecrets, TName>
    ): SecretRef
  }

  /**
   * Reference entire configMap as envFrom or specific key
   * @param configMapName - Name of the configMap (type-safe based on declared configMaps)
   * @param key - Optional key within the configMap (type-safe based on configMap definition)
   * @returns ConfigMapRef marker for deployment builder
   * @example
   * // Reference entire configMap (envFrom)
   * env: ({ configMap }) => configMap('api-config')
   * // Generates: envFrom: [{ configMapRef: { name: 'api-config' } }]
   *
   * // Reference specific key (valueFrom)
   * env: ({ configMap }) => ({
   *   LOG_LEVEL: configMap('api-config', 'LOG_LEVEL')
   * })
   * // Generates: env: [{ name: 'LOG_LEVEL', valueFrom: { configMapKeyRef: { name: 'api-config', key: 'LOG_LEVEL' } } }]
   */
  configMap: {
    (configMapName: TConfigMapNames): ConfigMapRef
    <TName extends ConfigMapKey<TConfigMaps>>(
      configMapName: TName,
      key: ConfigMapValueKeys<TConfigMaps, TName>
    ): ConfigMapRef
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get environment variable with optional fallback
   * @param key - Environment variable name
   * @param fallback - Optional fallback value
   * @returns Environment variable value or fallback
   * @example
   * env('DATABASE_URL') // -> process.env.DATABASE_URL
   * env('DEBUG', 'false') // -> process.env.DEBUG || 'false'
   */
  env: <T extends string = string>(key: string, fallback?: T) => T

  /**
   * Simple template string helper
   * @param str - Template string with {placeholders}
   * @param vars - Variables to replace
   * @returns Processed string
   * @example
   * template('https://{host}/api', { host: 'example.com' })
   * // -> 'https://example.com/api'
   */
  template: (str: string, vars: Record<string, string>) => string
}

/**
 * Host context with helpers and namespace variables.
 * All custom variables from namespace definition are spread into this context.
 */
export type AppHostContextWithHelpers<
  TNamespaceVars extends NamespaceDefinition,
  TProject extends string = string,
  TNamespaceName extends string = string,
  TSecrets = undefined,
  TConfigMaps = undefined,
  TApps = undefined
> = AppContextCoreHelpers<
  TProject,
  TNamespaceName,
  SecretKey<TSecrets>,
  ConfigMapKey<TConfigMaps>,
  TSecrets,
  TConfigMaps,
  TApps,
  AppKey<TApps>
> &
  ValidateNamespaceVars<TNamespaceVars>

/**
 * Extended context with helper functions for app configuration.
 * This is what env/secrets/configMaps config functions receive.
 *
 * Note: Variables like `dev`, `production`, etc. should be declared in namespace definitions.
 */
export type AppEnvContext<
  TNamespaceVars extends NamespaceDefinition,
  TProject extends string = string,
  TNamespaceName extends string = string,
  TSecrets = undefined,
  TConfigMaps = undefined,
  TApps = undefined
> = AppHostContextWithHelpers<
  TNamespaceVars,
  TProject,
  TNamespaceName,
  TSecrets,
  TConfigMaps,
  TApps
>

export type AppEnvResolver<
  TNamespaceVars extends NamespaceDefinition,
  TProject extends string = string,
  TNamespaceName extends string = string,
  TSecrets = undefined,
  TConfigMaps = undefined,
  TApps = undefined
> = (
  ctx: AppEnvContext<TNamespaceVars, TProject, TNamespaceName, TSecrets, TConfigMaps, TApps>
) => Record<string, EnvValue> | SecretRef | ConfigMapRef

export type AppEnv<
  TNamespaceVars extends NamespaceDefinition,
  TProject extends string = string,
  TNamespaceName extends string = string,
  TSecrets = undefined,
  TConfigMaps = undefined,
  TApps = undefined
> =
  | Record<string, EnvValue>
  | AppEnvResolver<TNamespaceVars, TProject, TNamespaceName, TSecrets, TConfigMaps, TApps>

export interface AppIngressOptions {
  className?: string
  annotations?: Record<string, string>
  path?: string
  pathType?: HTTPIngressPath['pathType']
  tls?: IngressTLS[]
}

export interface AppIngressRouteServiceOptions
  extends Partial<
    Pick<
      IngressRouteService,
      | 'name'
      | 'namespace'
      | 'scheme'
      | 'kind'
      | 'serversTransport'
      | 'nativeLB'
      | 'nodePortLB'
      | 'passHostHeader'
    >
  > {
  port?: IngressRouteService['port']
}

export interface AppIngressRouteRouteOptions {
  match?: string
  priority?: number
  middlewares?: IngressRouteMiddlewareRef[]
  services?: AppIngressRouteServiceOptions[]
}

export interface AppIngressRouteOptions {
  entryPoints?: IngressRouteSpec['entryPoints']
  routes?: AppIngressRouteRouteOptions[]
  middlewares?: IngressRouteMiddlewareRef[]
  tls?: IngressRouteTLS
}

export interface AppCertificateOptions
  extends Partial<Omit<CertificateSpec, 'issuerRef' | 'dnsNames' | 'secretName'>> {
  secretName?: string
  issuerRef: CertificateIssuerRef
  dnsNames?: string[]
  commonName?: CertificateSpec['commonName']
}

export interface AppIngressOptions {
  ingress?: boolean | AppIngressOptions
  ingressRoute?: boolean | AppIngressRouteOptions
  certificate?: boolean | AppCertificateOptions
}

export type AppIngressDefinition<
  TNamespaceVars extends NamespaceDefinition,
  TProject extends string = string,
  TNamespaceName extends string = string,
  TSecrets = undefined,
  TConfigMaps = undefined,
  TApps = undefined
> =
  | string
  | boolean
  | AppIngressOptions
  | ((
      ctx: AppEnvContext<TNamespaceVars, TProject, TNamespaceName, TSecrets, TConfigMaps, TApps>
    ) => string | boolean | AppIngressOptions)

export type AppDeploySelection<TNamespaceName extends string> =
  | 'all'
  | readonly TNamespaceName[]
  | {
      include?: readonly TNamespaceName[]
      exclude?: readonly TNamespaceName[]
    }

/**
 * Defines secrets that should be created for an app.
 * Can be static data or a function that resolves per namespace.
 */
export type AppSecretsDefinition<
  TNamespaceVars extends NamespaceDefinition,
  TProject extends string = string,
  TNamespaceName extends string = string,
  TSecrets = undefined,
  TConfigMaps = undefined
> =
  | Record<string, Record<string, string>> // secretName -> key-value pairs
  | ((
      ctx: AppEnvContext<TNamespaceVars, TProject, TNamespaceName, TSecrets, TConfigMaps>
    ) => Record<string, Record<string, string>>)

/**
 * Defines ConfigMaps that should be created for an app.
 * Can be static data or a function that resolves per namespace.
 */
export type AppConfigMapsDefinition<
  TNamespaceVars extends NamespaceDefinition,
  TProject extends string = string,
  TNamespaceName extends string = string,
  TSecrets = undefined,
  TConfigMaps = undefined
> =
  | Record<string, Record<string, string>> // configMapName -> key-value pairs
  | ((
      ctx: AppEnvContext<TNamespaceVars, TProject, TNamespaceName, TSecrets, TConfigMaps>
    ) => Record<string, Record<string, string>>)

export interface VolumeMount {
  name: string
  mountPath: string
  readOnly?: boolean
  subPath?: string
}

export interface Volume {
  name: string
  configMap?: { name: string }
  secret?: { secretName: string }
  emptyDir?: Record<string, unknown>
  persistentVolumeClaim?: { claimName: string }
}

export interface ServicePort {
  name: string
  port: number
  targetPort?: number | string
  protocol?: 'TCP' | 'UDP'
}

export type AppDefinition<
  TNamespaceVars extends NamespaceDefinition,
  TProject extends string = string,
  TNamespaceName extends string = string,
  TSecrets = undefined,
  TConfigMaps = undefined,
  TApps = undefined
> = {
  image?: string
  build?: BuildDefinition
  env?: AppEnv<TNamespaceVars, TProject, TNamespaceName, TSecrets, TConfigMaps, TApps>
  podAnnotations?: Record<string, string>
  volumes?: Volume[]
  volumeMounts?: VolumeMount[]
  args?: string[]
  ports?: ServicePort[]
  deploy?: AppDeploySelection<TNamespaceName> | undefined
  ingress?: AppIngressDefinition<
    TNamespaceVars,
    TProject,
    TNamespaceName,
    TSecrets,
    TConfigMaps,
    TApps
  >
} & Record<string, unknown>

/**
 * Single secret definition - can be static or a function that resolves per namespace.
 */
export type SecretDefinition<
  TNamespaceVars extends NamespaceDefinition,
  TProject extends string = string,
  TNamespaceName extends string = string,
  TSecrets = undefined,
  TConfigMaps = undefined,
  TApps = undefined
> =
  | Record<string, string> // key-value pairs
  | ((
      ctx: AppEnvContext<TNamespaceVars, TProject, TNamespaceName, TSecrets, TConfigMaps, TApps>
    ) => Record<string, string>)

/**
 * Single configMap definition - can be static or a function that resolves per namespace.
 */
export type ConfigMapDefinition<
  TNamespaceVars extends NamespaceDefinition,
  TProject extends string = string,
  TNamespaceName extends string = string,
  TSecrets = undefined,
  TConfigMaps = undefined,
  TApps = undefined
> =
  | Record<string, string> // key-value pairs
  | ((
      ctx: AppEnvContext<TNamespaceVars, TProject, TNamespaceName, TSecrets, TConfigMaps, TApps>
    ) => Record<string, string>)

/**
 * Secrets collection organized by secret name at config root level.
 */
export type SecretsMap<
  TNamespaceVars extends NamespaceDefinition,
  TProject extends string = string,
  TNamespaceName extends string = string
> = {
  [secretName: string]: SecretDefinition<TNamespaceVars, TProject, TNamespaceName>
}

/**
 * ConfigMaps collection organized by configMap name at config root level.
 */
export type ConfigMapsMap<
  TNamespaceVars extends NamespaceDefinition,
  TProject extends string = string,
  TNamespaceName extends string = string
> = {
  [configMapName: string]: ConfigMapDefinition<TNamespaceVars, TProject, TNamespaceName>
}

/**
 * Extract the shape of namespace variables (all namespaces must have consistent shape).
 * Returns the type of the first namespace's value.
 */
export type ExtractNamespaceVars<TNamespaces extends Record<string, NamespaceDefinition>> =
  TNamespaces[keyof TNamespaces]

/**
 * Extract namespace variables type from TsOpsConfig
 */
export type ExtractNamespaceVarsFromConfig<
  TConfig extends TsOpsConfig<any, any, any, any, any, any, any>
> = ExtractNamespaceVars<TConfig['namespaces']>

export type TsOpsConfig<
  TProject extends string,
  TNamespaces extends Record<string, NamespaceDefinition>,
  TClusters extends Record<string, ClusterDefinition<Extract<keyof TNamespaces, string>>>,
  TImages extends ImagesConfig,
  // Avoid recursive constraint to preserve literal app key inference
  TApps extends Record<string, unknown>,
  TSecrets extends Record<string, unknown> | undefined = undefined,
  TConfigMaps extends Record<string, unknown> | undefined = undefined
> = {
  project: TProject
  /**
   * Namespace definitions with custom variables.
   * All namespaces must have the same shape (consistent structure).
   * Variables defined here are available in app configuration functions.
   *
   * @example
   * namespaces: {
   *   dev: {
   *     domain: 'dev.example.com',
   *     replicas: 1,
   *     dbHost: 'dev-db.internal'
   *   },
   *   prod: {
   *     domain: 'example.com',
   *     replicas: 3,
   *     dbHost: 'prod-db.internal'
   *   }
   * }
   */
  namespaces: TNamespaces
  clusters: TClusters
  images: TImages
  apps: {
    [K in keyof TApps]: AppDefinition<
      ExtractNamespaceVars<TNamespaces>,
      TProject,
      Extract<keyof TNamespaces, string>,
      TSecrets,
      TConfigMaps,
      TApps
    >
  }
  /**
   * Secrets collection organized by secret name.
   * @example
   * secrets: {
   *   'api-secrets': ({ production }) => ({
   *     JWT_SECRET: production ? process.env.JWT! : 'dev'
   *   }),
   *   'db-secrets': {
   *     PASSWORD: 'secret'
   *   }
   * }
   */
  secrets?: TSecrets
  /**
   * ConfigMaps collection organized by configMap name.
   * @example
   * configMaps: {
   *   'api-config': { LOG_LEVEL: 'info' }
   * }
   */
  configMaps?: TConfigMaps
}
