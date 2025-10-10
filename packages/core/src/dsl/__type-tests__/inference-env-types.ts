/**
 * Inference: Environment variable types
 * Verifies EnvSpec structure is correctly typed
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
    api: { port: 443, protocol: 'https' }
  },
  
  env: {
    DATABASE_URL: {
      required: true,
      scope: 'runtime',
      kind: 'url',
      secretRef: 'secret://db/url' as any
    },
    DEBUG: {
      required: false,
      scope: 'runtime',
      kind: 'bool',
      devDefault: 'false'
    }
  }
})

// Type checks
type EnvType = typeof config.env
type DatabaseUrlType = EnvType['DATABASE_URL']
type DebugType = EnvType['DEBUG']

// Should be correctly typed
const _check1: DatabaseUrlType['required'] = true
const _check2: DatabaseUrlType['scope'] = 'runtime'
const _check3: DebugType['required'] = false
const _check4: NonNullable<DebugType['devDefault']> = 'false'
