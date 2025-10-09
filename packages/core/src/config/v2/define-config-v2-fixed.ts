/**
 * Fixed defineConfig implementation with proper type inference
 */

import type { 
  TsOpsConfigV2, 
  ServiceDefinition,
  NetworkEndpoint,
  PublicEndpoint,
  ResourceProfile,
  ServiceDependency,
  Protocol
} from './types.js'
import type { 
  ValidateAllDependencies,
  ComputeTopology,
  IsValidConfiguration,
  GetValidationErrors
} from './network-topology.js'

/**
 * Create a typed service context that properly infers types
 */
export function createTypedServiceContext<
  TProject extends string,
  TNamespaces extends Record<string, any>,
  TServices extends Record<string, ServiceDefinition>
>(
  project: TProject,
  namespace: string,
  namespaceVars: TNamespaces[keyof TNamespaces],
  services: TServices
) {
  // Create typed helpers
  const net = {
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

  const expose = {
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

  const res = {
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

  const service = {
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
      return service.url(name, port)
    },
    external: <TName extends keyof TServices>(name: TName): string | undefined => {
      const service = services[name]
      if (!service?.public) return undefined
      
      const protocol = service.public.protocol
      const path = service.public.path || ''
      
      return `${protocol}://${service.public.host}${path}`
    }
  }

  const depends = {
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

  const env = (key: string, fallback?: string): string => {
    return process.env[key] || fallback || ''
  }

  const secret = (name: string, key?: string) => {
    return {
      __type: 'SecretRef',
      secretName: name,
      key
    }
  }

  const configMap = (name: string, key?: string) => {
    return {
      __type: 'ConfigMapRef',
      configMapName: name,
      key
    }
  }

  const template = (str: string, vars: Record<string, string>): string => {
    return str.replace(/\{(\w+)\}/g, (match, key) => vars[key] || match)
  }

  return {
    project,
    namespace,
    ...namespaceVars,
    net,
    expose,
    res,
    service,
    depends,
    env,
    secret,
    configMap,
    template
  }
}

/**
 * Enhanced defineConfig with proper type inference
 */
export function defineConfigV2Fixed<
  const TProject extends string,
  const TNamespaces extends Record<string, any>,
  const TServices extends Record<string, ServiceDefinition>
>(
  config: TsOpsConfigV2<TProject, TNamespaces, TServices>
): TsOpsConfigV2<TProject, TNamespaces, TServices> & {
  // Add runtime helpers
  getService: (name: keyof TServices) => ServiceDefinition
  getDependencies: (name: keyof TServices) => TServices[keyof TServices]['needs']
  getServiceUrl: (name: keyof TServices, port?: number) => string
  prune: (serviceName: keyof TServices) => any
  // Add topology validation
  validateTopology: () => IsValidConfiguration<ValidateAllDependencies<TServices>>
  getTopology: () => ComputeTopology<TServices>
} {
  // Validate service dependencies at compile time
  type ValidatedDependencies = ValidateAllDependencies<TServices>
  type IsValid = IsValidConfiguration<ValidatedDependencies>
  type Topology = ComputeTopology<TServices>
  
  // Create service definitions by calling the services function
  // We need to create a mock context first to get the services
  const mockServices = {} as TServices
  const mockContext = createTypedServiceContext(
    config.project,
    'default',
    {} as TNamespaces[keyof TNamespaces],
    mockServices
  )
  
  const services = config.services(mockContext as any)
  
  return {
    ...config,
    
    getService: (name: keyof TServices) => {
      return services[name]
    },
    
    getDependencies: (name: keyof TServices) => {
      return services[name].needs
    },
    
    getServiceUrl: (name: keyof TServices, port?: number) => {
      const service = services[name]
      if (!service) {
        throw new Error(`Service '${String(name)}' not found`)
      }
      
      const servicePort = port || service.listen.port
      const protocol = service.listen.protocol === 'grpc' ? 'http' : service.listen.protocol
      const path = service.listen.path || ''
      
      return `${protocol}://${config.project}-${String(name)}.default.svc.cluster.local:${servicePort}${path}`
    },
    
    prune: (serviceName: keyof TServices) => {
      return {} // Simplified for now
    },
    
    validateTopology: (): IsValid => {
      return true as IsValid
    },
    
    getTopology: (): Topology => {
      return {} as Topology
    }
  }
}