/**
 * Dynamic Infrastructure DSL - Main module.
 * Provides type-safe infrastructure configuration with compile-time invariants.
 * 
 * @module dsl
 */

import type { Core, TypedCore, Services, Images } from './core.js'
import type { Helpers } from './helpers.js'
import type { MaybeFn } from './utils.js'
import type { EnvSpec, IngressRule } from './validators.js'
import type { Regions, Namespaces, Clusters } from './core.js'
import { createHelpers } from './runtime.js'

// Re-export all types
export * from './brands.js'
export * from './utils.js'
export * from './validators.js'
export * from './core.js'
export * from './helpers.js'
export * from './runtime.js'

// ============================================================================
// Dynamic Configuration - Late-bound sections
// ============================================================================

/**
 * Dynamic configuration with early (core) and late (helpers-dependent) sections.
 * Late sections can be static objects or functions that receive typed helpers.
 */
export type DynamicConfig<C extends Core> = C & {
  /**
   * Images configuration - can depend on helpers.
   * @example
   * images: (h) => ({
   *   api: { repo: 'ghcr.io/org/api', tag: 'latest' }
   * })
   */
  images?: MaybeFn<Helpers<C>, Images>

  /**
   * Services configuration - can depend on helpers.
   * Use helpers to validate dependencies, generate hosts, etc.
   * 
   * @example
   * services: (h) => h.validate.noCycles({
   *   api: {
   *     expose: 'public',
   *     listen: { kind: 'http', protocol: 'https', port: 443 as Port },
   *     public: { ns: 'prod', host: h.hostFor('prod', 'api'), basePath: h.path('/') }
   *   }
   * })
   */
  services: MaybeFn<Helpers<C>, Services>

  /**
   * Environment variables configuration - can depend on helpers and services.
   * @example
   * env: (h) => ({
   *   ...h.env.require('DATABASE_URL', {
   *     scope: 'runtime',
   *     kind: 'url',
   *     secretRef: h.secretRef('db', 'url')
   *   }),
   *   ...h.env.optional('DEBUG', { scope: 'runtime', devDefault: 'false' })
   * })
   */
  env?: MaybeFn<Helpers<C>, EnvSpec>

  /**
   * Ingress rules configuration - can depend on helpers.
   * @example
   * ingress: (h) => h.validate.ingress([
   *   {
   *     ns: 'prod',
   *     host: h.hostFor('prod', 'api'),
   *     tls: { policy: 'letsencrypt' },
   *     paths: [h.path('/')]
   *   }
   * ])
   */
  ingress?: MaybeFn<Helpers<C>, IngressRule[]>
}

// ============================================================================
// Main DSL Definition Function
// ============================================================================

/**
 * Define infrastructure configuration with type-safe DSL.
 * 
 * The DSL works in two phases:
 * 1. Core facts (project, regions, namespaces, clusters) - defined upfront
 * 2. Dynamic sections (services, env, ingress) - can use typed helpers
 * 
 * This creates a "living" DSL where:
 * - IDE autocompletes only valid values
 * - Type errors catch architectural issues at compile time
 * - Invariants are enforced through the type system
 * 
 * @param config - Full configuration object
 * @returns Same config object (for runtime use)
 * 
 * @example
 * ```ts
 * import { defineDSL, fqdn, port, path } from '@tsops/core/dsl'
 * 
 * const cfg = defineDSL({
 *   project: 'my-app',
 *   
 *   regions: {
 *     us: fqdn('example.com'),
 *     eu: fqdn('example.eu')
 *   },
 *   
 *   namespaces: {
 *     'us-prod': { region: 'us' },
 *     'eu-prod': { region: 'eu' }
 *   },
 *   
 *   clusters: {
 *     'k8s-us': {
 *       apiServer: 'https://k8s-us.example.com:6443',
 *       context: 'k8s-us',
 *       namespaces: ['us-prod'] as const
 *     }
 *   },
 *   
 *   services: (h) => h.validate.noCycles({
 *     api: {
 *       expose: 'public',
 *       listen: { kind: 'http', protocol: 'https', port: port(443) },
 *       public: {
 *         ns: 'us-prod',
 *         host: h.hostFor('us-prod', 'api'),
 *         basePath: h.path('/')
 *       }
 *     }
 *   }),
 *   
 *   env: (h) => ({
 *     ...h.env.require('DATABASE_URL', {
 *       scope: 'runtime',
 *       kind: 'url',
 *       secretRef: h.secretRef('db', 'url')
 *     })
 *   })
 * })
 * ```
 */
export function defineDSL<
  TProject extends string,
  TRegions extends Regions,
  TNamespaces extends Namespaces<TRegions>,
  TClusters extends Clusters<TNamespaces>,
  C extends TypedCore<TProject, TRegions, TNamespaces, TClusters>,
  Out extends DynamicConfig<C>
>(config: Out): Out {
  // The magic happens at the type level!
  // Runtime: just return the config as-is
  return config
}

/**
 * Resolve dynamic configuration by evaluating all MaybeFn sections.
 * This converts functions to their return values using helpers.
 * 
 * @param config - Dynamic configuration
 * @returns Resolved configuration with all functions evaluated
 */
export function resolveDSL<C extends Core, D extends DynamicConfig<C>>(
  config: D
): Omit<D, 'images' | 'services' | 'env' | 'ingress'> & {
  images?: Images
  services: Services
  env?: EnvSpec
  ingress?: IngressRule[]
} {
  const helpers = createHelpers(config)

  const resolveSection = <T>(section: MaybeFn<Helpers<C>, T> | undefined): T | undefined => {
    if (section === undefined) return undefined
    return typeof section === 'function' ? (section as any)(helpers) : section
  }

  const result = {
    project: config.project,
    regions: config.regions,
    namespaces: config.namespaces,
    clusters: config.clusters,
    images: resolveSection(config.images),
    services: resolveSection(config.services)!,
    env: resolveSection(config.env),
    ingress: resolveSection(config.ingress)
  }
  
  return result as any
}

/**
 * Get external endpoint URL for a public service.
 * 
 * @param config - Resolved DSL config
 * @param serviceName - Service name
 * @returns External URL or undefined if service is not public
 */
export function getExternalEndpoint(
  config: ReturnType<typeof resolveDSL>,
  serviceName: string
): string | undefined {
  const service = config.services[serviceName]
  if (!service?.public) return undefined

  const { host, basePath } = service.public
  return `https://${host}${basePath}`
}

/**
 * Get internal cluster endpoint for a service.
 * 
 * @param config - Resolved DSL config
 * @param serviceName - Service name
 * @param namespace - Namespace name
 * @returns Internal cluster DNS name
 */
export function getInternalEndpoint(
  config: ReturnType<typeof resolveDSL>,
  serviceName: string,
  namespace: string
): string {
  return `${serviceName}.${namespace}.svc.cluster.local`
}
