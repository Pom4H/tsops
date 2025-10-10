/**
 * Valid: Using $ helper syntax
 * Should compile with helper functions
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
  
  // Using $ helper
  services: $ => ({
    api: {
      host: $('prod', 'api'),
      path: $.path('/v1'),
      port: 443,
      protocol: 'https'
    }
  }),
  
  env: $ => ({
    DATABASE_URL: $.secret('db', 'url') as any
  })
})
