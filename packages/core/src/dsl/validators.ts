/**
 * Type-level validators and invariant checkers.
 * These ensure structural constraints are met at compile time.
 * 
 * @module dsl/validators
 */

import type { Keys, Values, AllDistinct } from './utils.js'
import type { Path, SecretRefString } from './brands.js'

// ============================================================================
// Dependency Graph Validation - Cycle Detection
// ============================================================================

/**
 * Service with potential dependencies.
 */
export type ServiceWithDeps = {
  needs?: readonly string[]
  [key: string]: unknown
}

/**
 * Extract dependency names from service.
 */
type NeedsOf<S, K extends Keys<S>> = S[K] extends { needs?: ReadonlyArray<infer D> }
  ? D
  : never

/**
 * Visit a single node in dependency graph using DFS.
 * Returns "cycle" if cycle detected, "ok" otherwise.
 */
type Visit<
  S extends Record<string, ServiceWithDeps>,
  K extends Keys<S>,
  Path extends string[]
> = K extends Path[number]
  ? 'cycle'
  : VisitAll<S, Extract<NeedsOf<S, K>, Keys<S>>, [...Path, K]>

/**
 * Visit all dependencies of current node.
 */
type VisitAll<
  S extends Record<string, ServiceWithDeps>,
  Deps extends string,
  Path extends string[]
> = [Deps] extends [never] ? 'ok' : Deps extends infer D extends Keys<S> ? Visit<S, D, Path> : 'ok'

/**
 * Check if services graph has no cycles.
 * Returns true if acyclic, never if cycle detected.
 * 
 * @example
 * type Services = {
 *   api: { needs: ['db'] },
 *   db: {}
 * }
 * type Valid = NoCycle<Services> // true
 * 
 * type Cyclic = {
 *   a: { needs: ['b'] },
 *   b: { needs: ['a'] }
 * }
 * type Invalid = NoCycle<Cyclic> // never
 */
export type NoCycle<S extends Record<string, ServiceWithDeps>> = Exclude<
  { [K in Keys<S>]: Visit<S, K, []> }[Keys<S>],
  'ok'
> extends never
  ? true
  : never

// ============================================================================
// Uniqueness Validation
// ============================================================================

/**
 * Ensure all hosts in nested map are unique.
 * 
 * @example
 * type Targets = {
 *   'ns-1': { api: 'api.example.com', web: 'web.example.com' },
 *   'ns-2': { api: 'api.other.com' }
 * }
 * type Valid = DistinctHosts<Targets> // Targets (same type)
 */
export type DistinctHosts<T extends Record<string, Record<string, string>>> =
  AllDistinct<Values<{ [ns in keyof T]: Values<T[ns]> }>> extends true ? T : never

/**
 * Ensure all ports are unique within service map.
 */
export type DistinctPorts<
  T extends Record<string, { listen: { port: number } | { port: number }[] }>
> = AllDistinct<
  Values<{
    [K in Keys<T>]: T[K]['listen'] extends any[]
      ? T[K]['listen'][number]['port']
      : T[K]['listen'] extends { port: infer P }
      ? P
      : never
  }>
> extends true
  ? T
  : never

// ============================================================================
// Ingress & TLS Validation
// ============================================================================

/**
 * Ingress TLS policy.
 */
export type TLSPolicy = 'letsencrypt' | 'custom'

/**
 * Ingress rule with TLS configuration.
 */
export type IngressRule = {
  ns: string
  host: string
  tls: {
    policy: TLSPolicy
    secretName?: string
  }
  paths: Path[]
}

/**
 * Check ingress TLS configuration is valid:
 * - letsencrypt policy must NOT have secretName
 * - custom policy SHOULD have secretName
 * 
 * Returns the rule if valid, never otherwise.
 */
export type CheckIngressTLS<I extends IngressRule> = I['tls']['policy'] extends 'letsencrypt'
  ? I['tls']['secretName'] extends string
    ? never
    : I
  : I

/**
 * Validate array of ingress rules.
 */
export type ValidateIngressRules<Rules extends readonly IngressRule[]> = {
  [K in keyof Rules]: CheckIngressTLS<Rules[K]>
}

// ============================================================================
// Environment Variable Policy Validation
// ============================================================================

/**
 * Environment variable scope - where it's used.
 */
export type EnvScope = 'runtime' | 'build' | 'job'

/**
 * Environment variable kind - semantic type.
 */
export type EnvKind = 'url' | 'path' | 'int' | 'bool' | 'raw'

/**
 * Environment variable rule definition.
 */
export type EnvRule<
  Req extends boolean = boolean,
  Scope extends EnvScope = EnvScope,
  Kind extends EnvKind = EnvKind
> = {
  required: Req
  scope: Scope
  devDefault?: string
  secretRef?: SecretRefString
  kind?: Kind
}

/**
 * Environment specification - map of var names to rules.
 */
export type EnvSpec = Record<string, EnvRule>

/**
 * Require that all required env vars have secretRef in production.
 * Returns the spec if valid, never otherwise.
 * 
 * @example
 * type Spec = {
 *   DATABASE_URL: { required: true, scope: 'runtime', secretRef: 'secret://db/url' }
 *   DEBUG: { required: false, scope: 'runtime' }
 * }
 * type Valid = RequireSecretsInProd<Spec> // Spec
 * 
 * type Invalid = {
 *   DATABASE_URL: { required: true, scope: 'runtime' } // missing secretRef!
 * }
 * type Error = RequireSecretsInProd<Invalid> // never
 */
export type RequireSecretsInProd<E extends EnvSpec> = {
  [K in keyof E]: E[K]['required'] extends true
    ? E[K]['secretRef'] extends SecretRefString
      ? E[K]
      : never
    : E[K]
} extends infer X
  ? { [K in keyof X]: X[K] }
  : never

/**
 * Validate that runtime-scoped vars have secretRef if required.
 */
export type ValidateRuntimeEnv<E extends EnvSpec> = {
  [K in keyof E]: E[K]['scope'] extends 'runtime'
    ? E[K]['required'] extends true
      ? E[K]['secretRef'] extends SecretRefString
        ? E[K]
        : never
      : E[K]
    : E[K]
}
