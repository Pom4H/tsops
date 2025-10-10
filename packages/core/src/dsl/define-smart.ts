/**
 * Smart DSL definition with improved DX.
 * Main entry point for simplified configuration API.
 * 
 * @module dsl/define-smart
 */

import type { Regions, Namespaces, Clusters, TypedCore } from './core.js'
import type { SmartDynamicConfig } from './smart-config.js'
import { resolveSmartDSL } from './smart-runtime.js'

// Re-export smart types
export type { SmartService, SmartServices, SmartDynamicConfig, ShortHelper } from './smart-config.js'
export { resolveSmartDSL, createShortHelper } from './smart-runtime.js'

/**
 * Define infrastructure with smart, concise syntax.
 * 
 * Key improvements over defineDSL:
 * - Services can be plain objects (no function wrapper)
 * - Automatic validation (no h.validate.noCycles)
 * - Smart host resolution from namespace + subdomain
 * - Template syntax: '@namespace/subdomain'
 * - Short helper ($) for common operations
 * 
 * @example
 * ```typescript
 * // Declarative style (recommended):
 * const config = smart({
 *   project: 'worken',
 *   regions: { ai: fqdn('worken.ai') },
 *   namespaces: { 'ai-prod': { region: 'ai' } },
 *   clusters: { ... },
 *   
 *   services: {
 *     api: {
 *       namespace: 'ai-prod',
 *       subdomain: 'api',
 *       path: '/v1',
 *       port: 443,
 *       protocol: 'https',
 *       needs: ['db']  // Auto-validated for cycles
 *     },
 *     db: {
 *       port: 5432,
 *       protocol: 'tcp'
 *     }
 *   },
 *   
 *   env: {
 *     DATABASE_URL: {
 *       required: true,
 *       scope: 'runtime',
 *       secretRef: 'secret://db/url'
 *     }
 *   }
 * })
 * 
 * // With $ helper (for complex cases):
 * const config = smart({
 *   project: 'worken',
 *   regions: { ai: fqdn('worken.ai') },
 *   namespaces: { 'ai-prod': { region: 'ai' } },
 *   clusters: { ... },
 *   
 *   services: $ => ({
 *     api: {
 *       host: $('ai-prod', 'api'),  // Short syntax
 *       path: $.path('/v1'),
 *       needs: ['db']
 *     }
 *   }),
 *   
 *   env: $ => ({
 *     DATABASE_URL: $.secret('db', 'url')
 *   })
 * })
 * 
 * // Template syntax:
 * const config = smart({
 *   services: {
 *     api: {
 *       host: '@ai-prod/api',  // Parsed automatically
 *       path: '/v1'
 *     }
 *   }
 * })
 * ```
 */
export function smart<
  TProject extends string,
  TRegions extends Regions,
  TNamespaces extends Namespaces<TRegions>,
  TClusters extends Clusters<TNamespaces>,
  C extends TypedCore<TProject, TRegions, TNamespaces, TClusters>,
  Out extends SmartDynamicConfig<C>
>(config: Out): Out {
  // Return as-is for type preservation
  // Actual resolution happens via resolveSmartDSL
  return config
}

/**
 * Alias for smart() - shorter name.
 */
export const define = smart

/**
 * Get resolved configuration with all smart features expanded.
 * 
 * @example
 * ```typescript
 * const config = smart({ ... })
 * const resolved = resolve(config)
 * 
 * console.log(resolved.services.api.public?.host)  // 'api.worken.ai'
 * ```
 */
export function resolve(config: any) {
  return resolveSmartDSL(config)
}
