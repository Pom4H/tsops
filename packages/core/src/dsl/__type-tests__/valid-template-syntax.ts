/**
 * Valid: Template syntax for hosts
 * Should compile with @namespace/subdomain syntax
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
      host: '@prod/api',  // Template syntax
      path: '/v1',
      port: 443,
      protocol: 'https'
    }
  }
})
