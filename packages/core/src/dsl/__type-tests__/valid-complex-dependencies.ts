/**
 * Valid: Complex service dependency graph
 * Should compile with deep dependency chain
 */

import { smart, fqdn } from '../../index.js'

const config = smart({
  project: 'test',
  
  regions: {
    us: fqdn('example.com')
  },
  
  namespaces: {
    prod: { region: 'us' }
  },
  
  clusters: {
    k8s: {
      apiServer: 'https://k8s.internal:6443',
      context: 'k8s',
      namespaces: ['prod'] as const
    }
  },
  
  services: {
    // Frontend depends on API Gateway
    web: {
      namespace: 'prod',
      subdomain: 'www',
      port: 443,
      protocol: 'https',
      needs: ['api-gateway']
    },
    
    // API Gateway depends on multiple services
    'api-gateway': {
      port: 8080,
      protocol: 'http',
      needs: ['auth', 'products', 'orders']
    },
    
    // Auth service depends on database
    auth: {
      port: 8081,
      protocol: 'http',
      needs: ['postgres', 'redis']
    },
    
    // Products service depends on database and search
    products: {
      port: 8082,
      protocol: 'http',
      needs: ['postgres', 'redis', 'elasticsearch']
    },
    
    // Orders service depends on multiple services
    orders: {
      port: 8083,
      protocol: 'http',
      needs: ['postgres', 'redis', 'payments', 'notifications']
    },
    
    // Payment service
    payments: {
      port: 8084,
      protocol: 'http',
      needs: ['postgres']
    },
    
    // Notification service
    notifications: {
      port: 8085,
      protocol: 'http',
      needs: ['redis']
    },
    
    // Infrastructure services
    postgres: {
      port: 5432,
      protocol: 'tcp'
    },
    redis: {
      port: 6379,
      protocol: 'tcp'
    },
    elasticsearch: {
      port: 9200,
      protocol: 'http'
    }
  }
})
