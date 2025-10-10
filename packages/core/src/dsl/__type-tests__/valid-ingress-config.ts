/**
 * Valid: Ingress configuration
 * Should compile with various TLS policies
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
      namespace: 'prod',
      subdomain: 'api',
      port: 443,
      protocol: 'https'
    }
  },
  
  ingress: [
    // Let's Encrypt TLS
    {
      ns: 'prod',
      host: 'api.example.com',
      tls: { policy: 'letsencrypt' },
      paths: ['/', '/v1'] as any[]
    },
    // Custom TLS with secret
    {
      ns: 'prod',
      host: 'admin.example.com',
      tls: { 
        policy: 'custom',
        secretName: 'admin-tls-cert'
      },
      paths: ['/'] as any[]
    }
  ]
})
