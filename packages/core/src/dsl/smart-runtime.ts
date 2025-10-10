/**
 * Runtime implementation for smart configuration.
 * Converts smart syntax to full configuration.
 * 
 * @module dsl/smart-runtime
 */

import type { Core, Services, Service } from './core.js'
import type { SmartServices, SmartService, ShortHelper, SmartDynamicConfig } from './smart-config.js'
import type { EnvSpec, IngressRule } from './validators.js'
import type { Images } from './core.js'
import { createHelpers } from './runtime.js'
import { path as createPath, port as createPort, secretRef as createSecretRef } from './brands.js'
import { parseHostTemplate, isHostTemplate } from './smart-config.js'

/**
 * Create short helper for concise syntax.
 */
export function createShortHelper<C extends Core>(config: C): ShortHelper<C> {
  const fullHelpers = createHelpers(config)
  
  // Main function: generate host from namespace + subdomain
  const helper: any = (namespace: string, subdomain: string) => {
    return fullHelpers.hostFor(namespace as any, subdomain)
  }
  
  // Additional helpers
  helper.path = (p: string) => createPath(p)
  
  helper.url = (protocol: 'http' | 'https', host: string, path: string) => {
    return `${protocol}://${host}${path}`
  }
  
  helper.secret = (namespace: string, key: string) => {
    return createSecretRef(namespace, key)
  }
  
  helper.full = fullHelpers
  
  return helper as ShortHelper<C>
}

/**
 * Convert smart service to full service definition.
 */
export function expandSmartService(
  config: Core,
  serviceName: string,
  smartService: SmartService
): Service {
  const service: Service = { ...smartService } as Service
  
  // Resolve host from namespace + subdomain
  if (smartService.namespace && smartService.subdomain && !smartService.host) {
    const ns = config.namespaces[smartService.namespace]
    if (!ns) {
      throw new Error(`Unknown namespace: ${smartService.namespace}`)
    }
    const region = ns.region
    const domain = config.regions[region]
    if (!domain) {
      throw new Error(`Unknown region: ${region}`)
    }
    service.public = {
      ns: smartService.namespace,
      host: `${smartService.subdomain}.${domain}`,
      basePath: createPath(smartService.path || '/')
    }
  }
  
  // Handle direct host string (could be template or regular host)
  if (typeof smartService.host === 'string') {
    if (isHostTemplate(smartService.host)) {
      // Parse host template: '@namespace/subdomain'
      const parsed = parseHostTemplate(smartService.host)
      if (parsed) {
        const ns = config.namespaces[parsed.namespace]
        if (!ns) {
          throw new Error(`Unknown namespace in template: ${parsed.namespace}`)
        }
        const region = ns.region
        const domain = config.regions[region]
        service.public = {
          ns: parsed.namespace,
          host: `${parsed.subdomain}.${domain}`,
          basePath: createPath(smartService.path || '/')
        }
      }
    } else {
      // Regular host string from $ helper or manual
      // Infer namespace from service if available, or use first namespace
      const ns = smartService.namespace || Object.keys(config.namespaces)[0]
      service.public = {
        ns,
        host: smartService.host,
        basePath: createPath(smartService.path || '/')
      }
    }
  }
  
  // Convert shorthand port + protocol to listen
  if (smartService.port && smartService.protocol && !service.listen) {
    if (smartService.protocol === 'http' || smartService.protocol === 'https') {
      service.listen = {
        kind: 'http',
        protocol: smartService.protocol,
        port: createPort(smartService.port)
      }
    } else {
      service.listen = {
        kind: 'tcp',
        port: createPort(smartService.port)
      }
    }
  }
  
  return service
}

/**
 * Convert smart services to full services.
 */
export function expandSmartServices(
  config: Core,
  smartServices: SmartServices
): Services {
  const services: Services = {}
  
  for (const [name, smartService] of Object.entries(smartServices)) {
    services[name] = expandSmartService(config, name, smartService)
  }
  
  return services
}

/**
 * Validate services for cycles and other constraints.
 */
export function validateServices(services: Services): void {
  // Cycle detection
  const visited = new Set<string>()
  const recursionStack = new Set<string>()
  
  function hasCycle(serviceName: string): boolean {
    if (recursionStack.has(serviceName)) {
      return true
    }
    if (visited.has(serviceName)) {
      return false
    }
    
    visited.add(serviceName)
    recursionStack.add(serviceName)
    
    const service = services[serviceName]
    if (service?.needs) {
      for (const dep of service.needs) {
        if (hasCycle(dep as string)) {
          throw new Error(
            `Dependency cycle detected: ${serviceName} -> ${dep}`
          )
        }
      }
    }
    
    recursionStack.delete(serviceName)
    return false
  }
  
  for (const serviceName of Object.keys(services)) {
    if (!visited.has(serviceName)) {
      hasCycle(serviceName)
    }
  }
}

/**
 * Resolve smart dynamic config to full config.
 * Automatically:
 * - Expands smart services
 * - Validates for cycles
 * - Resolves hosts from templates
 */
export function resolveSmartDSL<C extends Core, D extends SmartDynamicConfig<C>>(
  config: D
): {
  project: C['project']
  regions: C['regions']
  namespaces: C['namespaces']
  clusters: C['clusters']
  images?: Images
  services: Services
  env?: EnvSpec
  ingress?: IngressRule[]
} {
  const $ = createShortHelper(config)
  
  // Resolve services
  let services: Services
  if (typeof config.services === 'function') {
    const result = config.services($)
    // Always try to expand as SmartServices - it will preserve existing Service fields
    services = expandSmartServices(config, result as SmartServices)
  } else {
    services = expandSmartServices(config, config.services)
  }
  
  // Auto-validate
  validateServices(services)
  
  // Resolve images
  const images = typeof config.images === 'function'
    ? config.images($)
    : config.images
  
  // Resolve env
  const env = typeof config.env === 'function'
    ? config.env($)
    : config.env
  
  // Resolve ingress
  const ingress = typeof config.ingress === 'function'
    ? config.ingress($)
    : config.ingress
  
  return {
    project: config.project,
    regions: config.regions,
    namespaces: config.namespaces,
    clusters: config.clusters,
    images,
    services,
    env,
    ingress
  }
}
