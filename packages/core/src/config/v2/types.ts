/**
 * Simple V2 configuration types
 */

export type Protocol = 'http' | 'https' | 'tcp' | 'udp' | 'grpc'

export type ServiceKind = 'api' | 'gateway' | 'worker' | 'database' | 'cache' | 'queue'

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
  replicas: number
}

export interface ServiceDependency {
  service: string
  port: number
  protocol: Protocol
  description?: string
  optional?: boolean
}

export interface ServiceDefinition {
  kind: ServiceKind
  listen: NetworkEndpoint
  public?: PublicEndpoint
  needs: ServiceDependency[]
  resources: ResourceProfile
  description?: string
}

// Simple context type that spreads namespace variables
export type ServiceContext<
  TProject extends string,
  TNamespaces extends Record<string, any>,
  TServices extends Record<string, ServiceDefinition>
> = {
  project: TProject
  namespace: string
  net: {
    http: (port: number, path?: string) => NetworkEndpoint
    https: (port: number, path?: string) => NetworkEndpoint
    tcp: (port: number) => NetworkEndpoint
    udp: (port: number) => NetworkEndpoint
    grpc: (port: number) => NetworkEndpoint
  }
  expose: {
    httpsHost: (domain: string, path?: string) => PublicEndpoint
    httpHost: (domain: string, path?: string) => PublicEndpoint
    custom: (host: string, protocol: 'http' | 'https', path?: string) => PublicEndpoint
  }
  res: {
    smol: ResourceProfile
    medium: ResourceProfile
    large: ResourceProfile
    custom: (cpu: string, memory: string, storage?: string, replicas?: number) => ResourceProfile
  }
  service: {
    url: (name: keyof TServices, port?: number) => string
    internal: (name: keyof TServices, port?: number) => string
    external: (name: keyof TServices) => string | undefined
  }
  depends: {
    on: <TName extends keyof TServices>(
      service: TName, 
      port: number, 
      options?: {
        protocol?: Protocol
        description?: string
        optional?: boolean
      }
    ) => ServiceDependency
  }
  env: (key: string, fallback?: string) => string
  secret: (name: string, key?: string) => any
  configMap: (name: string, key?: string) => any
  template: (str: string, vars: Record<string, string>) => string
} & TNamespaces[keyof TNamespaces]

export interface TsOpsConfigV2<
  TProject extends string,
  TNamespaces extends Record<string, any>,
  TServices extends Record<string, ServiceDefinition>
> {
  project: TProject
  namespaces: TNamespaces
  services: (context: ServiceContext<TProject, TNamespaces, TServices>) => TServices
}