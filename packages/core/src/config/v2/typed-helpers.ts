/**
 * Typed helpers for service configuration
 * Provides better type inference and validation
 */

import type { 
  ServiceDefinition, 
  ServiceDependency, 
  NetworkEndpoint, 
  PublicEndpoint, 
  ResourceProfile,
  Protocol
} from './types.js'

/**
 * Create typed dependency helper that validates service names at compile time
 */
export function createTypedDependencyHelpers<TServices extends Record<string, ServiceDefinition>>(
  services: TServices
) {
  return {
    on: <TName extends keyof TServices>(
      service: TName,
      port: number,
      options?: {
        protocol?: Protocol
        description?: string
        optional?: boolean
      }
    ): ServiceDependency<TServices> => {
      const targetService = services[service]
      if (!targetService) {
        throw new Error(`Service '${String(service)}' not found`)
      }
      
      return {
        service,
        port,
        protocol: options?.protocol || targetService.listen.protocol,
        description: options?.description,
        optional: options?.optional || false
      }
    }
  }
}

/**
 * Create typed service discovery helpers
 */
export function createTypedServiceHelpers<TServices extends Record<string, ServiceDefinition>>(
  project: string,
  namespace: string,
  services: TServices
) {
  return {
    url: <TName extends keyof TServices>(name: TName, port?: number): string => {
      const service = services[name]
      if (!service) {
        throw new Error(`Service '${String(name)}' not found`)
      }
      
      const servicePort = port || service.listen.port
      const protocol = service.listen.protocol === 'grpc' ? 'http' : service.listen.protocol
      const path = service.listen.path || ''
      
      return `${protocol}://${project}-${String(name)}.${namespace}.svc.cluster.local:${servicePort}${path}`
    },
    
    internal: <TName extends keyof TServices>(name: TName, port?: number): string => {
      return createTypedServiceHelpers(project, namespace, services).url(name, port)
    },
    
    external: <TName extends keyof TServices>(name: TName): string | undefined => {
      const service = services[name]
      if (!service?.public) return undefined
      
      const protocol = service.public.protocol
      const path = service.public.path || ''
      
      return `${protocol}://${service.public.host}${path}`
    }
  }
}

/**
 * Create typed network helpers
 */
export function createTypedNetworkHelpers() {
  return {
    http: (port: number, path?: string): NetworkEndpoint => ({
      protocol: 'http',
      port,
      path
    }),
    
    https: (port: number, path?: string): NetworkEndpoint => ({
      protocol: 'https',
      port,
      path
    }),
    
    tcp: (port: number): NetworkEndpoint => ({
      protocol: 'tcp',
      port
    }),
    
    udp: (port: number): NetworkEndpoint => ({
      protocol: 'udp',
      port
    }),
    
    grpc: (port: number): NetworkEndpoint => ({
      protocol: 'grpc',
      port
    })
  }
}

/**
 * Create typed exposure helpers
 */
export function createTypedExposeHelpers() {
  return {
    httpsHost: (domain: string, path?: string): PublicEndpoint => ({
      host: domain,
      protocol: 'https',
      path
    }),
    
    httpHost: (domain: string, path?: string): PublicEndpoint => ({
      host: domain,
      protocol: 'http',
      path
    }),
    
    custom: (host: string, protocol: 'http' | 'https', path?: string): PublicEndpoint => ({
      host,
      protocol,
      path
    })
  }
}

/**
 * Create typed resource helpers
 */
export function createTypedResourceHelpers() {
  return {
    smol: {
      cpu: '100m',
      memory: '128Mi',
      replicas: 1
    } as ResourceProfile,
    
    medium: {
      cpu: '500m',
      memory: '512Mi',
      replicas: 2
    } as ResourceProfile,
    
    large: {
      cpu: '1000m',
      memory: '1Gi',
      replicas: 3
    } as ResourceProfile,
    
    custom: (cpu: string, memory: string, storage?: string, replicas?: number): ResourceProfile => ({
      cpu,
      memory,
      storage,
      replicas
    })
  }
}

/**
 * Create typed environment helpers
 */
export function createTypedEnvironmentHelpers() {
  return {
    env: (key: string, fallback?: string): string => {
      return process.env[key] || fallback || ''
    },
    
    secret: (name: string, key?: string) => {
      return {
        __type: 'SecretRef',
        secretName: name,
        key
      }
    },
    
    configMap: (name: string, key?: string) => {
      return {
        __type: 'ConfigMapRef',
        configMapName: name,
        key
      }
    },
    
    template: (str: string, vars: Record<string, string>): string => {
      return str.replace(/\{(\w+)\}/g, (match, key) => vars[key] || match)
    }
  }
}