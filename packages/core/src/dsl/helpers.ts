/**
 * Helper system for dynamic DSL sections.
 * Provides type-safe builders that are computed from core facts.
 * 
 * @module dsl/helpers
 */

import type {
  FQDN,
  Path,
  Port,
  Host,
  Url,
  HttpProtocol,
  SecretRefString,
  path,
  url,
  host,
  secretRef
} from './brands.js'
import type { Keys, Values } from './utils.js'
import type { NoCycle, DistinctHosts, CheckIngressTLS, IngressRule, EnvRule, EnvSpec } from './validators.js'
import type {
  Regions,
  Namespaces,
  Clusters,
  Core,
  Services,
  Images,
  HostFor,
  DomainForNamespace,
  RegionOf
} from './core.js'

// ============================================================================
// Helpers Type - Type-safe builders derived from Core
// ============================================================================

/**
 * Helper functions available in dynamic sections.
 * All helpers are strongly typed based on the core configuration.
 */
export type Helpers<C extends Core> = {
  // ---------- Facts (for convenience) ----------
  project: C['project']
  regions: C['regions']
  namespaces: C['namespaces']
  clusters: C['clusters']

  // ---------- Domain Builders ----------

  /**
   * Generate host for namespace with subdomain.
   * @param ns - Namespace name (type-safe from config)
   * @param sub - Subdomain prefix
   * @returns Host in format: `${sub}.${region_fqdn}`
   * 
   * @example
   * h.hostFor('ai-prod', 'api') // -> 'api.worken.ai'
   */
  hostFor: <N extends Keys<C['namespaces']>>(
    ns: N,
    sub: string
  ) => HostFor<C['namespaces'], C['regions'], N>

  /**
   * Create Path with leading slash validation.
   * @param p - Path string (must start with /)
   * @returns Branded Path
   * 
   * @example
   * h.path('/api/v1') // -> Path
   */
  path: (p: string) => Path

  /**
   * Create complete URL from components.
   * @param proto - Protocol (http | https)
   * @param hostname - Host name
   * @param pathname - Path
   * @returns Branded Url
   * 
   * @example
   * h.url('https', 'api.example.com', h.path('/v1')) // -> Url
   */
  url: <H extends string, P extends Path>(
    proto: HttpProtocol,
    hostname: H,
    pathname: P
  ) => Url<typeof proto, H, P>

  // ---------- Environment Helpers ----------

  env: {
    /**
     * Define required environment variable.
     * @param key - Variable name
     * @param rule - Variable configuration (without 'required' field)
     * @returns EnvSpec with required: true
     * 
     * @example
     * h.env.require('DATABASE_URL', {
     *   scope: 'runtime',
     *   kind: 'url',
     *   secretRef: h.secretRef('db', 'url')
     * })
     */
    require: <K extends string>(
      key: K,
      rule: Omit<EnvRule<true>, 'required'>
    ) => Record<K, EnvRule<true>>

    /**
     * Define optional environment variable.
     * @param key - Variable name
     * @param rule - Variable configuration (without 'required' field)
     * @returns EnvSpec with required: false
     * 
     * @example
     * h.env.optional('DEBUG', {
     *   scope: 'runtime',
     *   kind: 'bool',
     *   devDefault: 'false'
     * })
     */
    optional: <K extends string>(
      key: K,
      rule?: Omit<EnvRule<false>, 'required'>
    ) => Record<K, EnvRule<false>>

    /**
     * Auto-generate NEXT_PUBLIC_* vars for public services.
     * @param services - Services map with public config
     * @returns EnvSpec with generated public vars
     * 
     * @example
     * h.env.nextPublicFor({
     *   api: { public: { host: 'api.example.com', ... } },
     *   web: { public: { host: 'web.example.com', ... } }
     * })
     * // Generates: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WEB_URL
     */
    nextPublicFor: <S extends Services>(
      services: S
    ) => {
      [K in Extract<keyof S, string> as S[K] extends { public: any }
        ? `NEXT_PUBLIC_${Uppercase<K>}_URL`
        : never]: EnvRule<true> & { kind: 'url'; scope: 'runtime' }
    }
  }

  /**
   * Create secret reference.
   * @param namespace - Secret namespace
   * @param key - Secret key
   * @returns SecretRefString
   * 
   * @example
   * h.secretRef('db', 'password') // -> 'secret://db/password'
   */
  secretRef: (namespace: string, key: string) => SecretRefString

  // ---------- Validators ----------

  validate: {
    /**
     * Validate services graph has no cycles.
     * @param services - Services map
     * @returns Services if valid, never if cycle detected
     * 
     * @example
     * h.validate.noCycles({
     *   api: { needs: ['db'] },
     *   db: {}
     * })
     */
    noCycles: <S extends Services>(s: S) => NoCycle<S> extends true ? S : never

    /**
     * Validate all hosts are distinct across namespaces.
     * @param targets - Nested map of hosts
     * @returns Targets if valid, never if duplicates
     * 
     * @example
     * h.validate.distinctHosts({
     *   'ns1': { api: 'api1.com', web: 'web1.com' },
     *   'ns2': { api: 'api2.com' }
     * })
     */
    distinctHosts: <T extends Record<string, Record<string, string>>>(
      targets: T
    ) => DistinctHosts<T>

    /**
     * Validate ingress rules.
     * @param rules - Array of ingress rules
     * @returns Validated rules
     * 
     * @example
     * h.validate.ingress([
     *   {
     *     ns: 'prod',
     *     host: 'api.example.com',
     *     tls: { policy: 'letsencrypt' },
     *     paths: [h.path('/')]
     *   }
     * ])
     */
    ingress: <I extends IngressRule[]>(rules: I) => {
      [K in keyof I]: CheckIngressTLS<I[K]>
    }
  }
}

// ============================================================================
// Runtime Implementation Stubs
// (Actual implementations in runtime.ts)
// ============================================================================

/**
 * Create runtime helpers instance.
 * This function is implemented in runtime.ts
 */
export type CreateHelpers = <C extends Core>(config: C) => Helpers<C>
