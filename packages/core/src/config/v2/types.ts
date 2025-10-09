/**
 * New configuration schema with typed service dependencies
 * Designed for better DX and service topology awareness
 */

export type ServiceKind = 'gateway' | 'api' | 'worker' | 'database' | 'cache' | 'queue' | 'storage'

export type Protocol = 'http' | 'https' | 'tcp' | 'udp' | 'grpc'

export interface NetworkEndpoint {
  protocol: Protocol
  port: number
  path?: string
}

export interface PublicEndpoint {
  host: string
  protocol: 'http' | 'https'
  path?: string
}

export interface ResourceProfile {
  cpu: string
  memory: string
  storage?: string
  replicas?: number
}

export interface ServiceDependency<T extends Record<string, ServiceDefinition>> {
  service: keyof T
  port: number
  protocol?: Protocol
  description?: string
  optional?: boolean
}

export interface ServiceDefinition {
  kind: ServiceKind
  listen: NetworkEndpoint
  public?: PublicEndpoint
  needs: ServiceDependency<any>[]
  resources: ResourceProfile
  description?: string
  // Inherit from existing AppDefinition
  image?: string
  build?: any
  env?: any
  podAnnotations?: Record<string, string>
  volumes?: any[]
  volumeMounts?: any[]
  args?: string[]
  ports?: any[]
  deploy?: any
  network?: any
}

// Context helpers for service configuration
export interface ServiceContext<
  TProject extends string,
  TNamespaces extends Record<string, any>,
  TServices extends Record<string, ServiceDefinition>
> {
  // Project metadata
  project: TProject
  namespace: string
  
  // Namespace variables (spread from current namespace)
  [K in keyof TNamespaces[keyof TNamespaces]]: TNamespaces[keyof TNamespaces][K]
  
  // Network helpers
  net: {
    http: (port: number, path?: string) => NetworkEndpoint
    https: (port: number, path?: string) => NetworkEndpoint
    tcp: (port: number) => NetworkEndpoint
    udp: (port: number) => NetworkEndpoint
    grpc: (port: number) => NetworkEndpoint
  }
  
  // Exposure helpers
  expose: {
    httpsHost: (domain: string, path?: string) => PublicEndpoint
    httpHost: (domain: string, path?: string) => PublicEndpoint
    custom: (host: string, protocol: 'http' | 'https', path?: string) => PublicEndpoint
  }
  
  // Resource helpers
  res: {
    smol: ResourceProfile
    medium: ResourceProfile
    large: ResourceProfile
    custom: (cpu: string, memory: string, storage?: string, replicas?: number) => ResourceProfile
  }
  
  // Service discovery helpers
  service: {
    url: (name: keyof TServices, port?: number) => string
    internal: (name: keyof TServices, port?: number) => string
    external: (name: keyof TServices) => string | undefined
  }
  
  // Dependency helpers with proper typing
  depends: {
    on: <TName extends keyof TServices>(
      service: TName,
      port: number,
      options?: {
        protocol?: Protocol
        description?: string
        optional?: boolean
      }
    ) => ServiceDependency<TServices>
  }
  
  // Environment helpers (inherited from existing)
  env: (key: string, fallback?: string) => string
  secret: (name: string, key?: string) => any
  configMap: (name: string, key?: string) => any
  template: (str: string, vars: Record<string, string>) => string
}

// New configuration schema
export interface TsOpsConfigV2<
  TProject extends string,
  TNamespaces extends Record<string, any>,
  TServices extends Record<string, ServiceDefinition>
> {
  project: TProject
  namespaces: TNamespaces
  services: (ctx: ServiceContext<TProject, TNamespaces, TServices>) => TServices
  // Inherit other fields from existing config
  clusters?: any
  images?: any
  secrets?: any
  configMaps?: any
}

// Type helpers for better DX
export type InferServiceNames<T> = T extends Record<string, ServiceDefinition> ? keyof T : never

export type InferServiceDependencies<T, K extends keyof T> = 
  T[K] extends ServiceDefinition 
    ? T[K]['needs'][number]['service']
    : never

export type InferServiceKind<T, K extends keyof T> = 
  T[K] extends ServiceDefinition 
    ? T[K]['kind']
    : never

// Validation helpers
export type ValidateServiceDependencies<T extends Record<string, ServiceDefinition>> = {
  [K in keyof T]: T[K]['needs'][number]['service'] extends keyof T
    ? T[K]
    : {
        __error: `Service '${string & K}' references unknown service in dependencies`
        __invalidDeps: Exclude<T[K]['needs'][number]['service'], keyof T>
      }
}

export type ValidateCircularDependencies<T extends Record<string, ServiceDefinition>> = 
  // This would need a more complex type to detect cycles
  T

// Runtime configuration for pruned services
export interface PrunedServiceConfig {
  name: string
  kind: ServiceKind
  image: string
  internalUrl: string
  externalUrl?: string
  port: number
  dependencies: Array<{
    service: string
    url: string
    port: number
    protocol: Protocol
    description?: string
  }>
  environment: Record<string, {
    type: 'static' | 'secret' | 'configmap' | 'env'
    value?: string
    secretName?: string
    secretKey?: string
    configMapName?: string
    configMapKey?: string
    envVar?: string
  }>
  resources: ResourceProfile
}