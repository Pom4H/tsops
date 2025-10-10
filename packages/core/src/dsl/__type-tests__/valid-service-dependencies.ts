/**
 * Valid: Service with dependencies
 * Should compile and validate dependencies at runtime
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
    api: {
      port: 8080,
      protocol: 'http',
      needs: ['db', 'cache']  // Valid: these services exist
    },
    db: {
      port: 5432,
      protocol: 'tcp'
    },
    cache: {
      port: 6379,
      protocol: 'tcp'
    }
  }
})
