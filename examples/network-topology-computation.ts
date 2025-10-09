/**
 * Examples of network topology computation and analysis
 * Shows how TypeScript can compute the entire network graph at compile time
 */

import { defineConfigV2 } from '@tsops/core/config/v2'

// Complex microservices configuration
export const microservicesConfig = defineConfigV2({
  project: 'e-commerce',
  
  namespaces: {
    prod: { domain: 'shop.com' }
  },
  
  services: ({ domain, net, expose, res, depends }) => ({
    // Data layer
    database: {
      kind: 'database',
      listen: net.tcp(5432),
      needs: [],
      resources: res.large,
      description: 'PostgreSQL database'
    },
    
    cache: {
      kind: 'cache',
      listen: net.tcp(6379),
      needs: [],
      resources: res.medium,
      description: 'Redis cache'
    },
    
    queue: {
      kind: 'queue',
      listen: net.tcp(5672),
      needs: [],
      resources: res.medium,
      description: 'RabbitMQ queue'
    },
    
    // Business logic layer
    'user-service': {
      kind: 'api',
      listen: net.http(8080),
      needs: [
        depends.on('database', 5432, { protocol: 'tcp' }),
        depends.on('cache', 6379, { protocol: 'tcp' })
      ],
      resources: res.medium,
      description: 'User management service'
    },
    
    'product-service': {
      kind: 'api',
      listen: net.http(8081),
      needs: [
        depends.on('database', 5432, { protocol: 'tcp' }),
        depends.on('cache', 6379, { protocol: 'tcp' })
      ],
      resources: res.medium,
      description: 'Product catalog service'
    },
    
    'order-service': {
      kind: 'api',
      listen: net.http(8082),
      needs: [
        depends.on('database', 5432, { protocol: 'tcp' }),
        depends.on('queue', 5672, { protocol: 'tcp' })
      ],
      resources: res.medium,
      description: 'Order processing service'
    },
    
    'payment-service': {
      kind: 'api',
      listen: net.http(8083),
      needs: [
        depends.on('database', 5432, { protocol: 'tcp' }),
        depends.on('queue', 5672, { protocol: 'tcp' })
      ],
      resources: res.medium,
      description: 'Payment processing service'
    },
    
    // API Gateway layer
    'api-gateway': {
      kind: 'gateway',
      listen: net.http(80),
      public: expose.httpsHost(domain),
      needs: [
        depends.on('user-service', 8080),
        depends.on('product-service', 8081),
        depends.on('order-service', 8082),
        depends.on('payment-service', 8083)
      ],
      resources: res.medium,
      description: 'API Gateway'
    },
    
    // Background workers
    'email-worker': {
      kind: 'worker',
      listen: net.http(8084),
      needs: [
        depends.on('queue', 5672, { protocol: 'tcp' }),
        depends.on('database', 5432, { protocol: 'tcp' })
      ],
      resources: res.smol,
      description: 'Email processing worker'
    },
    
    'analytics-worker': {
      kind: 'worker',
      listen: net.http(8085),
      needs: [
        depends.on('queue', 5672, { protocol: 'tcp' }),
        depends.on('database', 5432, { protocol: 'tcp' })
      ],
      resources: res.smol,
      description: 'Analytics processing worker'
    }
  })
})

// Type-level topology analysis
type Config = typeof microservicesConfig
type Services = Config['services']

// Extract service names
type ServiceNames = keyof Services
// Result: 'database' | 'cache' | 'queue' | 'user-service' | 'product-service' | 'order-service' | 'payment-service' | 'api-gateway' | 'email-worker' | 'analytics-worker'

// Extract dependencies for a specific service
type ApiGatewayDeps = Services['api-gateway']['needs'][number]['service']
// Result: 'user-service' | 'product-service' | 'order-service' | 'payment-service'

type UserServiceDeps = Services['user-service']['needs'][number]['service']
// Result: 'database' | 'cache'

// Check if service has public endpoint
type HasPublicEndpoint<T extends ServiceNames> = Services[T]['public'] extends undefined ? false : true
type ApiGatewayPublic = HasPublicEndpoint<'api-gateway'> // true
type UserServicePublic = HasPublicEndpoint<'user-service'> // false

// Get service ports
type GetServicePort<T extends ServiceNames> = Services[T]['listen']['port']
type ApiGatewayPort = GetServicePort<'api-gateway'> // 80
type DatabasePort = GetServicePort<'database'> // 5432

// Get service protocols
type GetServiceProtocol<T extends ServiceNames> = Services[T]['listen']['protocol']
type ApiGatewayProtocol = GetServiceProtocol<'api-gateway'> // 'http'
type DatabaseProtocol = GetServiceProtocol<'database'> // 'tcp'

// Runtime topology analysis
const config = microservicesConfig

// Validate the entire topology
const isValid = config.validateTopology()
console.log('Topology is valid:', isValid)

// Get computed topology
const topology = config.getTopology()
console.log('Network topology:', topology)

// Analyze service dependencies
const apiGateway = config.getService('api-gateway')
const apiGatewayDeps = config.getDependencies('api-gateway')
console.log('API Gateway dependencies:', apiGatewayDeps)

// Check service URLs
const userServiceUrl = config.getServiceUrl('user-service')
const productServiceUrl = config.getServiceUrl('product-service')
console.log('User Service URL:', userServiceUrl)
console.log('Product Service URL:', productServiceUrl)

// Example: Find all services that depend on database
function findServicesDependingOnDatabase(services: typeof config.services) {
  const databaseDependents: string[] = []
  
  for (const [serviceName, service] of Object.entries(services)) {
    const dependencies = service.needs || []
    const dependsOnDatabase = dependencies.some(dep => dep.service === 'database')
    
    if (dependsOnDatabase) {
      databaseDependents.push(serviceName)
    }
  }
  
  return databaseDependents
}

const databaseDependents = findServicesDependingOnDatabase(config.services)
console.log('Services depending on database:', databaseDependents)
// Result: ['user-service', 'product-service', 'order-service', 'payment-service', 'email-worker', 'analytics-worker']

// Example: Find all public services
function findPublicServices(services: typeof config.services) {
  const publicServices: string[] = []
  
  for (const [serviceName, service] of Object.entries(services)) {
    if (service.public) {
      publicServices.push(serviceName)
    }
  }
  
  return publicServices
}

const publicServices = findPublicServices(config.services)
console.log('Public services:', publicServices)
// Result: ['api-gateway']

// Example: Build dependency graph
function buildDependencyGraph(services: typeof config.services) {
  const graph: Record<string, string[]> = {}
  
  for (const [serviceName, service] of Object.entries(services)) {
    const dependencies = service.needs || []
    graph[serviceName] = dependencies.map(dep => dep.service)
  }
  
  return graph
}

const dependencyGraph = buildDependencyGraph(config.services)
console.log('Dependency graph:', dependencyGraph)
/*
Result:
{
  'database': [],
  'cache': [],
  'queue': [],
  'user-service': ['database', 'cache'],
  'product-service': ['database', 'cache'],
  'order-service': ['database', 'queue'],
  'payment-service': ['database', 'queue'],
  'api-gateway': ['user-service', 'product-service', 'order-service', 'payment-service'],
  'email-worker': ['queue', 'database'],
  'analytics-worker': ['queue', 'database']
}
*/

// Example: Find circular dependencies (simplified)
function findCircularDependencies(graph: Record<string, string[]>) {
  const visited = new Set<string>()
  const recursionStack = new Set<string>()
  const circularDeps: string[] = []
  
  function dfs(node: string, path: string[]) {
    if (recursionStack.has(node)) {
      const cycleStart = path.indexOf(node)
      circularDeps.push(...path.slice(cycleStart), node)
      return
    }
    
    if (visited.has(node)) return
    
    visited.add(node)
    recursionStack.add(node)
    
    for (const neighbor of graph[node] || []) {
      dfs(neighbor, [...path, node])
    }
    
    recursionStack.delete(node)
  }
  
  for (const node of Object.keys(graph)) {
    if (!visited.has(node)) {
      dfs(node, [])
    }
  }
  
  return circularDeps
}

const circularDeps = findCircularDependencies(dependencyGraph)
console.log('Circular dependencies:', circularDeps)
// Result: [] (no circular dependencies in this configuration)