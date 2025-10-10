/**
 * Runtime tests for branded type validators
 */

import { describe, it, expect } from 'vitest'
import { fqdn, host, path, port, url, secretRef } from '../../index.js'

describe('Runtime: Branded Types', () => {
  describe('fqdn', () => {
    it('should create valid FQDN', () => {
      expect(fqdn('example.com')).toBe('example.com')
      expect(fqdn('api.example.com')).toBe('api.example.com')
      expect(fqdn('deep.sub.example.com')).toBe('deep.sub.example.com')
    })

    it('should throw for invalid FQDN (no dot)', () => {
      expect(() => fqdn('localhost')).toThrow(/must contain at least one dot/i)
      expect(() => fqdn('single')).toThrow()
    })
  })

  describe('host', () => {
    it('should create valid host', () => {
      expect(host('api.example.com')).toBe('api.example.com')
      expect(host('www.example.com')).toBe('www.example.com')
    })

    it('should throw for invalid host (no dot)', () => {
      expect(() => host('localhost')).toThrow(/must contain at least one dot/i)
    })
  })

  describe('path', () => {
    it('should create valid path', () => {
      expect(path('/')).toBe('/')
      expect(path('/api')).toBe('/api')
      expect(path('/api/v1')).toBe('/api/v1')
      expect(path('/api/v1/users/123')).toBe('/api/v1/users/123')
    })

    it('should throw for invalid path (no leading slash)', () => {
      expect(() => path('api' as any)).toThrow(/must start with/i)
      expect(() => path('api/v1' as any)).toThrow()
    })
  })

  describe('port', () => {
    it('should create valid port', () => {
      expect(port(80)).toBe(80)
      expect(port(443)).toBe(443)
      expect(port(8080)).toBe(8080)
      expect(port(1)).toBe(1)
      expect(port(65535)).toBe(65535)
    })

    it('should throw for invalid port (out of range)', () => {
      expect(() => port(0)).toThrow(/must be between 1 and 65535/i)
      expect(() => port(-1)).toThrow()
      expect(() => port(70000)).toThrow()
      expect(() => port(999999)).toThrow()
    })
  })

  describe('url', () => {
    it('should create valid URL', () => {
      expect(url('https', 'api.example.com', path('/'))).toBe('https://api.example.com/')
      expect(url('http', 'localhost:3000', path('/api'))).toBe('http://localhost:3000/api')
      expect(url('https', 'api.example.com', path('/v1/users'))).toBe('https://api.example.com/v1/users')
    })
  })

  describe('secretRef', () => {
    it('should create valid secret reference', () => {
      expect(secretRef('db', 'password')).toBe('secret://db/password')
      expect(secretRef('api', 'jwt-secret')).toBe('secret://api/jwt-secret')
      expect(secretRef('stripe', 'api-key')).toBe('secret://stripe/api-key')
    })
  })
})
