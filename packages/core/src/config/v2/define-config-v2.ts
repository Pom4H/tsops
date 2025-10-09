/**
 * New defineConfig implementation with typed service dependencies
 */

import type { 
  TsOpsConfigV2, 
  ServiceContext, 
  ServiceDefinition,
  ValidateServiceDependencies,
  ValidateCircularDependencies
} from './types.js'
import { createServiceContext } from './helpers.js'

/**
 * Enhanced defineConfig with typed service dependencies and better DX
 * 
 * @example
 * ```typescript
 * export default defineConfigV2({
 *   project: 'hyper-graph',
 *   
 *   namespaces: {
 *     prod: {
 *       domain: 'example.com'
 *     }
 *   },
 *   
 *   services: ({ domain, net, expose, res, depends }) => ({
 *     web: {
 *       kind: 'gateway',
 *       listen: net.http(8080),
 *       public: expose.httpsHost(domain),
 *       needs: [
 *         depends.on('api', 8080),
 *         depends.on('auth', 8081),
 *         depends.on('observability', 4318, { description: 'OTLP collector' })
 *       ],
 *       resources: res.smol,
 *       description: 'Web platform'
 *     },
 *     
 *     api: {
 *       kind: 'api',
 *       listen: net.http(8080),
 *       needs: [
 *         depends.on('database', 5432, { protocol: 'tcp' }),
 *         depends.on('cache', 6379, { protocol: 'tcp' })
 *       ],
 *       resources: res.medium,
 *       description: 'API service'
 *     }
 *   })
 * })
 * ```
 */
export function defineConfigV2<
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
  prune: (serviceName: keyof TServices) => PrunedConfig
} {
  // Validate service dependencies at compile time
  type ValidatedServices = ValidateServiceDependencies<TServices>
  type ValidatedConfig = ValidateCircularDependencies<ValidatedServices>
  
  // Create service definitions by calling the services function
  const services = config.services(createServiceContext(
    config.project,
    'default', // This would be resolved at runtime
    {}, // Namespace vars would be resolved at runtime
    {} as TServices // This creates a circular dependency issue that needs to be solved
  ))
  
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
      return createPrunedConfig(config, services, serviceName)
    }
  }
}

/**
 * Pruned configuration for a specific service
 */
export interface PrunedConfig {
  project: string
  namespace: string
  service: {
    name: string
    kind: string
    image: string
    internalUrl: string
    externalUrl?: string
    port: number
    resources: any
  }
  dependencies: Array<{
    service: string
    url: string
    port: number
    protocol: string
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
}

/**
 * Creates a pruned configuration for a specific service
 */
function createPrunedConfig<
  TProject extends string,
  TNamespaces extends Record<string, any>,
  TServices extends Record<string, ServiceDefinition>
>(
  config: TsOpsConfigV2<TProject, TNamespaces, TServices>,
  services: TServices,
  serviceName: keyof TServices
): PrunedConfig {
  const service = services[serviceName]
  if (!service) {
    throw new Error(`Service '${String(serviceName)}' not found`)
  }
  
  // Get direct dependencies
  const dependencies = service.needs.map(dep => {
    const depService = services[dep.service]
    if (!depService) {
      throw new Error(`Dependency service '${String(dep.service)}' not found`)
    }
    
    const protocol = dep.protocol || depService.listen.protocol
    const path = depService.listen.path || ''
    
    return {
      service: String(dep.service),
      url: `${protocol}://${config.project}-${String(dep.service)}.default.svc.cluster.local:${dep.port}${path}`,
      port: dep.port,
      protocol,
      description: dep.description
    }
  })
  
  // Create service info
  const serviceInfo = {
    name: String(serviceName),
    kind: service.kind,
    image: service.image || `${config.project}-${String(serviceName)}:latest`,
    internalUrl: `${service.listen.protocol}://${config.project}-${String(serviceName)}.default.svc.cluster.local:${service.listen.port}${service.listen.path || ''}`,
    externalUrl: service.public ? `${service.public.protocol}://${service.public.host}${service.public.path || ''}` : undefined,
    port: service.listen.port,
    resources: service.resources
  }
  
  // Create environment references (not values!)
  const environment: Record<string, any> = {
    NODE_ENV: { type: 'static', value: 'production' },
    PORT: { type: 'static', value: String(service.listen.port) }
  }
  
  // Add service URLs
  dependencies.forEach(dep => {
    environment[`${dep.service.toUpperCase()}_URL`] = {
      type: 'static',
      value: dep.url
    }
  })
  
  return {
    project: config.project,
    namespace: 'default', // Would be resolved at runtime
    service: serviceInfo,
    dependencies,
    environment
  }
}

// Re-export types for convenience
export type { 
  ServiceDefinition, 
  ServiceContext, 
  NetworkEndpoint, 
  PublicEndpoint, 
  ResourceProfile,
  ServiceDependency
} from './types.js'