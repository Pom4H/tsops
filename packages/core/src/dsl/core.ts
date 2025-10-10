/**
 * Core type definitions for dynamic infrastructure DSL.
 * Defines the primary facts from which all invariants are derived.
 * 
 * @module dsl/core
 */

import type { FQDN, Path, Port, Host, Url, HttpProtocol, SecretRefString } from './brands.js'
import type { Keys, Values } from './utils.js'

// ============================================================================
// Primary Facts - Minimal data from which everything else derives
// ============================================================================

/**
 * Regions map - defines root domains for each region.
 * 
 * @example
 * {
 *   ai: 'worken.ai' as FQDN,
 *   ru: 'worken.ru' as FQDN
 * }
 */
export type Regions = Record<string, FQDN>

/**
 * Namespace definition with region assignment.
 * Optional vars can be added for custom metadata.
 */
export type Namespace<R extends Regions> = {
  region: Keys<R>
  vars?: Record<string, string>
}

/**
 * Namespaces map - each namespace belongs to a region.
 * 
 * @example
 * {
 *   'ai-prod': { region: 'ai' },
 *   'ai-stage': { region: 'ai' },
 *   'ru-prod': { region: 'ru' }
 * }
 */
export type Namespaces<R extends Regions> = Record<string, Namespace<R>>

/**
 * Cluster definition - Kubernetes cluster with assigned namespaces.
 */
export type Cluster<NS extends Record<string, any>> = {
  apiServer: `https://${string}:${number}`
  context: string
  namespaces: readonly (Keys<NS>)[]
}

/**
 * Clusters map - each cluster can host multiple namespaces.
 * 
 * @example
 * {
 *   'docker-desktop': {
 *     apiServer: 'https://kubernetes.docker.internal:6443',
 *     context: 'docker-desktop',
 *     namespaces: ['ai-stage', 'ru-stage'] as const
 *   }
 * }
 */
export type Clusters<NS extends Record<string, any>> = Record<string, Cluster<NS>>

// ============================================================================
// Type-Level Derivations - Computed invariants
// ============================================================================

/**
 * Get FQDN for a region.
 */
export type DomainOf<R extends Regions, RG extends Keys<R>> = R[RG]

/**
 * Get region key for a namespace.
 */
export type RegionOf<NS extends Namespaces<R>, R extends Regions, N extends Keys<NS>> =
  NS[N]['region'] extends Keys<R> ? NS[N]['region'] : never

/**
 * Get FQDN for a namespace (via its region).
 */
export type DomainForNamespace<
  NS extends Namespaces<R>,
  R extends Regions,
  N extends Keys<NS>
> = DomainOf<R, RegionOf<NS, R, N>>

/**
 * Generate valid Host for namespace with subdomain.
 * Format: `${subdomain}.${region_fqdn}`
 */
export type HostFor<NS extends Namespaces<R>, R extends Regions, N extends Keys<NS>> = Host

// ============================================================================
// Service & Surface Definitions
// ============================================================================

/**
 * HTTP surface - exposed over HTTP/HTTPS.
 */
export type SurfaceHTTP = {
  kind: 'http'
  protocol: HttpProtocol
  port: Port
  path?: Path
}

/**
 * TCP surface - raw TCP connection.
 */
export type SurfaceTCP = {
  kind: 'tcp'
  port: Port
}

/**
 * Network surface - how service is exposed.
 */
export type Surface = SurfaceHTTP | SurfaceTCP

/**
 * Service exposure level.
 */
export type ExposeLevel = 'public' | 'cluster' | 'none'

/**
 * Public service configuration.
 */
export type PublicConfig = {
  ns: string
  host: string
  basePath: Path
}

/**
 * Service definition.
 */
export type Service = {
  description?: string
  expose?: ExposeLevel
  listen?: Surface | Surface[]
  needs?: readonly string[]
  public?: PublicConfig
}

/**
 * Services map.
 */
export type Services = Record<string, Service>

// ============================================================================
// Image Definitions
// ============================================================================

/**
 * Image definition with repository and tag.
 */
export type ImageDef = {
  repo: `ghcr.io/${string}/${string}`
  tag?: string
}

/**
 * Images map.
 */
export type Images = Record<string, ImageDef>

// ============================================================================
// Core Configuration - Foundation
// ============================================================================

/**
 * Core configuration - primary facts.
 */
export type Core = {
  project: string
  regions: Regions
  namespaces: Namespaces<any>
  clusters: Clusters<any>
}

/**
 * Type-safe core with proper constraints.
 */
export type TypedCore<
  TProject extends string,
  TRegions extends Regions,
  TNamespaces extends Namespaces<TRegions>,
  TClusters extends Clusters<TNamespaces>
> = {
  project: TProject
  regions: TRegions
  namespaces: TNamespaces
  clusters: TClusters
}

// ============================================================================
// External Endpoint Computation
// ============================================================================

/**
 * Extract external URL for public service.
 * Returns Url type if service has public config, never otherwise.
 */
export type ExternalOf<S extends Services, K extends Keys<S>> = S[K] extends {
  public: { host: infer H extends string; basePath: infer P extends Path }
}
  ? Url<'https', H, P>
  : never

/**
 * Extract internal cluster endpoint for service.
 * Returns DNS name in format: service-name.namespace.svc.cluster.local
 */
export type InternalOf<S extends Services, K extends Keys<S>, NS extends string> =
  `${K & string}.${NS}.svc.cluster.local`

// ============================================================================
// Port Extraction Utilities
// ============================================================================

/**
 * Extract port from surface definition.
 */
export type PortOfSurface<X> = X extends { port: infer P } ? P : never

/**
 * Extract all ports from service.
 */
export type PortsOf<S extends Service> = S['listen'] extends any[]
  ? PortOfSurface<S['listen'][number]>
  : PortOfSurface<S['listen']>
