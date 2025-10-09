/**
 * Helper functions for the new configuration schema
 */

import type { 
  ServiceContext, 
  NetworkEndpoint, 
  PublicEndpoint, 
  ResourceProfile,
  ServiceDependency,
  ServiceDefinition
} from './types.js'

/**
 * Creates network helpers for service configuration
 */
export function createNetworkHelpers<TProject extends string, TNamespaces extends Record<string, any>, TServices extends Record<string, ServiceDefinition>>(
  project: TProject,
  namespace: string
): ServiceContext<TProject, TNamespaces, TServices>['net'] {
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
 * Creates exposure helpers for public endpoints
 */
export function createExposeHelpers<TProject extends string, TNamespaces extends Record<string, any>, TServices extends Record<string, ServiceDefinition>>(
  project: TProject,
  namespace: string
): ServiceContext<TProject, TNamespaces, TServices>['expose'] {
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
 * Creates resource profile helpers
 */
export function createResourceHelpers<TProject extends string, TNamespaces extends Record<string, any>, TServices extends Record<string, ServiceDefinition>>(
  project: TProject,
  namespace: string
): ServiceContext<TProject, TNamespaces, TServices>['res'] {
  return {
    smol: {
      cpu: '100m',
      memory: '128Mi',
      replicas: 1
    },
    
    medium: {
      cpu: '500m',
      memory: '512Mi',
      replicas: 2
    },
    
    large: {
      cpu: '1000m',
      memory: '1Gi',
      replicas: 3
    },
    
    custom: (cpu: string, memory: string, storage?: string, replicas?: number): ResourceProfile => ({
      cpu,
      memory,
      storage,
      replicas
    })
  }
}

/**
 * Creates service discovery helpers
 */
export function createServiceHelpers<TProject extends string, TNamespaces extends Record<string, any>, TServices extends Record<string, ServiceDefinition>>(
  project: TProject,
  namespace: string,
  services: TServices
): ServiceContext<TProject, TNamespaces, TServices>['service'] {
  return {
    url: (name: keyof TServices, port?: number): string => {
      const service = services[name]
      if (!service) {
        throw new Error(`Service '${String(name)}' not found`)
      }
      
      const servicePort = port || service.listen.port
      const protocol = service.listen.protocol === 'grpc' ? 'http' : service.listen.protocol
      const path = service.listen.path || ''
      
      return `${protocol}://${project}-${String(name)}.${namespace}.svc.cluster.local:${servicePort}${path}`
    },
    
    internal: (name: keyof TServices, port?: number): string => {
      return createServiceHelpers(project, namespace, services).url(name, port)
    },
    
    external: (name: keyof TServices): string | undefined => {
      const service = services[name]
      if (!service?.public) return undefined
      
      const protocol = service.public.protocol
      const path = service.public.path || ''
      
      return `${protocol}://${service.public.host}${path}`
    }
  }
}

/**
 * Creates dependency helpers
 */
export function createDependencyHelpers<TProject extends string, TNamespaces extends Record<string, any>, TServices extends Record<string, ServiceDefinition>>(
  project: TProject,
  namespace: string,
  services: TServices
): ServiceContext<TProject, TNamespaces, TServices>['depends'] {
  return {
    on: <TName extends keyof TServices>(
      service: TName,
      port: number,
      options?: {
        protocol?: 'http' | 'https' | 'tcp' | 'udp' | 'grpc'
        description?: string
        optional?: boolean
      }
    ): ServiceDependency<TServices> => {
      const targetService = services[service]
      if (!targetService) {
        throw new Error(`Service '${String(service)}' not found in dependencies`)
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
 * Creates environment helpers (reuse existing implementation)
 */
export function createEnvironmentHelpers<TProject extends string, TNamespaces extends Record<string, any>, TServices extends Record<string, ServiceDefinition>>(
  project: TProject,
  namespace: string
): Pick<ServiceContext<TProject, TNamespaces, TServices>, 'env' | 'secret' | 'configMap' | 'template'> {
  // This would integrate with existing environment provider system
  return {
    env: (key: string, fallback?: string): string => {
      // Use existing environment provider
      return process.env[key] || fallback || ''
    },
    
    secret: (name: string, key?: string) => {
      // Return secret reference for Kubernetes
      return {
        __type: 'SecretRef',
        secretName: name,
        key
      }
    },
    
    configMap: (name: string, key?: string) => {
      // Return configMap reference for Kubernetes
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

/**
 * Creates the complete service context
 */
export function createServiceContext<TProject extends string, TNamespaces extends Record<string, any>, TServices extends Record<string, ServiceDefinition>>(
  project: TProject,
  namespace: string,
  namespaceVars: any,
  services: TServices
): ServiceContext<TProject, TNamespaces, TServices> {
  return {
    project,
    namespace,
    net: createNetworkHelpers(project, namespace),
    expose: createExposeHelpers(project, namespace),
    res: createResourceHelpers(project, namespace),
    service: createServiceHelpers(project, namespace, services),
    depends: createDependencyHelpers(project, namespace, services),
    ...createEnvironmentHelpers(project, namespace),
    ...namespaceVars
  } as ServiceContext<TProject, TNamespaces, TServices>
}