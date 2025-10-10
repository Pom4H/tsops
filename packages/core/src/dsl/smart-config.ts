/**
 * Smart configuration types with improved DX.
 * Enables declarative syntax without explicit helper calls.
 * 
 * @module dsl/smart-config
 */

import type { Core, Services, Service, Surface, Images } from './core.js'
import type { EnvSpec, IngressRule } from './validators.js'
import type { MaybeFn } from './utils.js'
import type { Path } from './brands.js'

// ============================================================================
// Smart Service Definition - Declarative Syntax
// ============================================================================

/**
 * Smart service definition with automatic host resolution.
 * Instead of calling helpers, just provide namespace and subdomain.
 */
export type SmartService = {
  description?: string
  
  /** Namespace where this service is deployed */
  namespace?: string
  
  /** Subdomain (will be combined with namespace's region domain) */
  subdomain?: string
  
  /** Full host override (use if subdomain + namespace not enough) */
  host?: string
  
  /** Path for public services */
  path?: string | Path
  
  /** Exposure level */
  expose?: 'public' | 'cluster' | 'none'
  
  /** Network surface */
  listen?: Surface | Surface[]
  
  /** Service dependencies (validated automatically for cycles) */
  needs?: readonly string[]
  
  /** Port number (shorthand for listen) */
  port?: number
  
  /** Protocol (shorthand for listen) */
  protocol?: 'http' | 'https' | 'tcp'
}

/**
 * Smart services map - declarative, no helpers needed.
 */
export type SmartServices = Record<string, SmartService>

/**
 * Short helper function - minimal syntax for common operations.
 * Usage: services: $ => ({ api: { host: $('ai-prod', 'api') } })
 */
export type ShortHelper<C extends Core> = {
  /** Generate host from namespace + subdomain */
  (namespace: string, subdomain: string): string
  
  /** Create path */
  path: (p: string) => Path
  
  /** Create URL */
  url: (protocol: 'http' | 'https', host: string, path: string) => string
  
  /** Reference secret */
  secret: (namespace: string, key: string) => string
  
  /** Access full helpers if needed */
  full: any  // Will be typed as Helpers<C>
}

// ============================================================================
// Improved Dynamic Config - Simpler Syntax
// ============================================================================

/**
 * Improved dynamic configuration with better DX.
 * - Services can be objects (no function wrapper needed)
 * - Automatic validation (no explicit h.validate calls)
 * - Smart host resolution from namespace + subdomain
 * - Optional short helper ($) for concise syntax
 */
export type SmartDynamicConfig<C extends Core> = C & {
  /**
   * Images - can be object or function with short helper.
   * @example
   * images: { api: { repo: 'ghcr.io/org/api', tag: 'latest' } }
   * // or
   * images: $ => ({ api: { repo: 'ghcr.io/org/api', tag: $.env('TAG', 'latest') } })
   */
  images?: Images | ((helpers: ShortHelper<C>) => Images)

  /**
   * Services - can be object or function.
   * Object syntax: automatic host resolution and validation.
   * Function syntax: use $ helper for concise operations.
   * 
   * @example
   * // Declarative (recommended):
   * services: {
   *   api: {
   *     namespace: 'ai-prod',
   *     subdomain: 'api',
   *     path: '/v1',
   *     port: 443,
   *     protocol: 'https',
   *     needs: ['db']
   *   }
   * }
   * 
   * // With helper (for complex cases):
   * services: $ => ({
   *   api: {
   *     host: $('ai-prod', 'api'),
   *     path: $.path('/v1'),
   *     needs: ['db']
   *   }
   * })
   */
  services: SmartServices | ((helpers: ShortHelper<C>) => SmartServices | Services)

  /**
   * Environment variables - can be object or function.
   * @example
   * env: {
   *   DATABASE_URL: { required: true, scope: 'runtime', secretRef: 'secret://db/url' }
   * }
   */
  env?: EnvSpec | ((helpers: ShortHelper<C>) => EnvSpec)

  /**
   * Ingress rules - can be array or function.
   * @example
   * ingress: [
   *   {
   *     ns: 'ai-prod',
   *     host: 'api.worken.ai',
   *     tls: { policy: 'letsencrypt' },
   *     paths: ['/', '/v1']
   *   }
   * ]
   */
  ingress?: IngressRule[] | ((helpers: ShortHelper<C>) => IngressRule[])
}

// ============================================================================
// Template String Helpers
// ============================================================================

/**
 * Template syntax for hosts: '@namespace/subdomain'
 * Example: '@ai-prod/api' -> 'api.worken.ai'
 */
export type HostTemplate = `@${string}/${string}`

/**
 * Parse host template into namespace and subdomain.
 */
export function parseHostTemplate(template: string): { namespace: string; subdomain: string } | null {
  const match = template.match(/^@([^/]+)\/(.+)$/)
  if (!match) return null
  return { namespace: match[1], subdomain: match[2] }
}

/**
 * Check if value is a host template.
 */
export function isHostTemplate(value: unknown): value is HostTemplate {
  return typeof value === 'string' && value.startsWith('@') && value.includes('/')
}
