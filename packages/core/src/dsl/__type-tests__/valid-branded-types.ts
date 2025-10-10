/**
 * Valid: Branded types usage
 * Should compile with proper branded type constructors
 */

import { fqdn, host, path, port, url, secretRef } from '../../index.js'

// FQDN
const domain1 = fqdn('example.com')
const domain2 = fqdn('api.example.com')

// Host
const host1 = host('api.example.com')
const host2 = host('www.example.com')

// Path
const path1 = path('/')
const path2 = path('/api')
const path3 = path('/api/v1/users')

// Port
const port1 = port(80)
const port2 = port(443)
const port3 = port(8080)

// URL
const url1 = url('https', 'api.example.com', path('/'))
const url2 = url('http', 'localhost:3000', path('/api'))

// SecretRef
const secret1 = secretRef('db', 'password')
const secret2 = secretRef('api', 'jwt-secret')

// All should be correctly typed
const _check1: typeof domain1 = fqdn('test.com')
const _check2: typeof host1 = host('test.example.com')
const _check3: typeof path1 = path('/test')
const _check4: typeof port1 = port(80) // Same port number for type compatibility
