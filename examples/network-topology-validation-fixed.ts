/**
 * Fixed examples showing network topology validation at compile time
 * Now with proper type inference and validation
 */

import { defineConfigV2Fixed } from '@tsops/core/config/v2/define-config-v2-fixed'

// ✅ VALID CONFIGURATION - All dependencies exist and match ports/protocols
export const validConfig = defineConfigV2Fixed({
  project: 'hyper-graph',
  
  namespaces: {
    prod: { domain: 'example.com' }
  },
  
  services: ({ domain, net, expose, res, depends }) => ({
    // API service - listens on port 8080 with HTTP
    api: {
      kind: 'api',
      listen: net.http(8080),
      needs: [],
      resources: res.medium,
      description: 'API service'
    },
    
    // Auth service - listens on port 8081 with HTTP
    auth: {
      kind: 'api', 
      listen: net.http(8081),
      needs: [],
      resources: res.medium,
      description: 'Auth service'
    },
    
    // Web service - depends on api (port 8080) and auth (port 8081)
    web: {
      kind: 'gateway',
      listen: net.http(8080),
      public: expose.httpsHost(domain),
      needs: [
        depends.on('api', 8080),     // ✅ Valid - api listens on 8080
        depends.on('auth', 8081)     // ✅ Valid - auth listens on 8081
      ],
      resources: res.smol,
      description: 'Web gateway'
    }
  })
})

// ❌ INVALID CONFIGURATION - TypeScript will show errors
export const invalidConfig = defineConfigV2Fixed({
  project: 'hyper-graph',
  
  namespaces: {
    prod: { domain: 'example.com' }
  },
  
  services: ({ domain, net, expose, res, depends }) => ({
    api: {
      kind: 'api',
      listen: net.http(8080),  // API listens on port 8080
      needs: [],
      resources: res.medium,
      description: 'API service'
    },
    
    web: {
      kind: 'gateway',
      listen: net.http(80),
      public: expose.httpsHost(domain),
      needs: [
        depends.on('api', 3000),     // ❌ ERROR: API listens on 8080, not 3000
        depends.on('auth', 8081),    // ❌ ERROR: 'auth' service doesn't exist
        depends.on('database', 5432, { protocol: 'http' }) // ❌ ERROR: database uses TCP, not HTTP
      ],
      resources: res.smol,
      description: 'Web gateway'
    }
  })
})

// TypeScript errors you would see:
// 1. Service 'auth' not found in services configuration
// 2. Service 'api' does not listen on port 3000 (actual: 8080, expected: 3000)
// 3. Service 'database' does not use protocol 'http' (actual: 'tcp', expected: 'http')

// ✅ COMPLEX VALID CONFIGURATION
export const complexValidConfig = defineConfigV2Fixed({
  project: 'microservices-app',
  
  namespaces: {
    prod: { domain: 'app.com' }
  },
  
  services: ({ domain, net, expose, res, depends }) => ({
    // Database - TCP protocol
    database: {
      kind: 'database',
      listen: net.tcp(5432),
      needs: [],
      resources: res.large,
      description: 'PostgreSQL database'
    },
    
    // Cache - TCP protocol  
    cache: {
      kind: 'cache',
      listen: net.tcp(6379),
      needs: [],
      resources: res.medium,
      description: 'Redis cache'
    },
    
    // API service - depends on database and cache
    api: {
      kind: 'api',
      listen: net.http(8080),
      needs: [
        depends.on('database', 5432, { protocol: 'tcp' }), // ✅ Valid TCP dependency
        depends.on('cache', 6379, { protocol: 'tcp' })     // ✅ Valid TCP dependency
      ],
      resources: res.medium,
      description: 'API service'
    },
    
    // Auth service - depends on database
    auth: {
      kind: 'api',
      listen: net.http(8081),
      needs: [
        depends.on('database', 5432, { protocol: 'tcp' })  // ✅ Valid TCP dependency
      ],
      resources: res.medium,
      description: 'Auth service'
    },
    
    // Web gateway - depends on API and auth
    web: {
      kind: 'gateway',
      listen: net.http(80),
      public: expose.httpsHost(domain),
      needs: [
        depends.on('api', 8080),     // ✅ Valid HTTP dependency
        depends.on('auth', 8081)     // ✅ Valid HTTP dependency
      ],
      resources: res.smol,
      description: 'Web gateway'
    }
  })
})

// ✅ MIXED PROTOCOL CONFIGURATION
export const mixedProtocolConfig = defineConfigV2Fixed({
  project: 'hybrid-app',
  
  namespaces: {
    prod: { domain: 'hybrid.com' }
  },
  
  services: ({ domain, net, expose, res, depends }) => ({
    // gRPC service
    'grpc-api': {
      kind: 'api',
      listen: net.grpc(9090),
      needs: [],
      resources: res.medium,
      description: 'gRPC API service'
    },
    
    // HTTP service
    'http-api': {
      kind: 'api',
      listen: net.http(8080),
      needs: [],
      resources: res.medium,
      description: 'HTTP API service'
    },
    
    // WebSocket service
    'ws-service': {
      kind: 'api',
      listen: net.http(8081),
      needs: [],
      resources: res.medium,
      description: 'WebSocket service'
    },
    
    // Gateway that connects to all services
    gateway: {
      kind: 'gateway',
      listen: net.http(80),
      public: expose.httpsHost(domain),
      needs: [
        depends.on('grpc-api', 9090, { protocol: 'grpc' }), // ✅ Valid gRPC dependency
        depends.on('http-api', 8080, { protocol: 'http' }),  // ✅ Valid HTTP dependency
        depends.on('ws-service', 8081, { protocol: 'http' }) // ✅ Valid HTTP dependency
      ],
      resources: res.medium,
      description: 'Multi-protocol gateway'
    }
  })
})

// Type checking examples
type ValidConfigType = typeof validConfig
type InvalidConfigType = typeof invalidConfig

// These would be type errors in invalidConfig:
// type ApiPortError = InvalidConfigType['services']['web']['needs'][0]
// type AuthServiceError = InvalidConfigType['services']['web']['needs'][1] 
// type DatabaseProtocolError = InvalidConfigType['services']['web']['needs'][2]

// Runtime validation
console.log('Valid config topology:', validConfig.validateTopology())
console.log('Invalid config topology:', invalidConfig.validateTopology())

// Get network topology
const topology = validConfig.getTopology()
console.log('Network topology:', topology)

// Test the fixed configuration
const testConfig = validConfig
const apiService = testConfig.getService('api')
const webDependencies = testConfig.getDependencies('web')
const apiUrl = testConfig.getServiceUrl('api', 8080)

console.log('API Service:', apiService)
console.log('Web Dependencies:', webDependencies)
console.log('API URL:', apiUrl)