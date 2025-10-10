/**
 * Brand types for semantic type safety.
 * Brands ensure compile-time distinction between structurally identical types.
 * 
 * @module dsl/brands
 */

/**
 * Brand helper that attaches a unique symbol to a base type.
 * This prevents accidental mixing of semantically different values.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B }

/**
 * Fully Qualified Domain Name - must contain at least one dot.
 * Examples: 'example.com', 'api.worken.ai'
 */
export type FQDN = Brand<`${string}.${string}`, 'FQDN'>

/**
 * Host name - can be subdomain of FQDN.
 * Examples: 'api.worken.ai', 'app.dev.example.com'
 */
export type Host = Brand<`${string}.${string}`, 'Host'>

/**
 * Path - must start with forward slash.
 * Examples: '/', '/api', '/v1/users'
 */
export type Path = Brand<`/${string}`, 'Path'>

/**
 * Port number - branded to prevent confusion with regular numbers.
 */
export type Port<N extends number = number> = Brand<N, 'Port'>

/**
 * HTTP Protocol - either http or https.
 */
export type HttpProtocol = 'http' | 'https'

/**
 * Complete URL with protocol, host and path.
 * Examples: 'https://api.example.com/', 'http://localhost:3000/api'
 */
export type Url<
  P extends HttpProtocol = HttpProtocol,
  H extends string = string,
  U extends Path = Path
> = Brand<`${P}://${H}${U}`, 'URL'>

/**
 * Secret reference string in the format: secret://namespace/key
 * Examples: 'secret://db/password', 'secret://api/jwt-key'
 * Note: This is different from types.SecretRef (which is a runtime object)
 */
export type SecretRefString = Brand<`secret://${string}/${string}`, 'SecretRefString'>

/** Alias for clarity in DSL context */
export type DslSecretRef = SecretRefString

/**
 * Git SHA tag - 7 or 40 character hexadecimal.
 */
export type GitShaTag = Brand<string, 'GitShaTag'>

/**
 * Semantic version tag.
 * Examples: 'v1.0.0', 'v2.3.4-beta'
 */
export type SemVerTag = Brand<`v${number}.${number}.${number}${string}`, 'SemVerTag'>

/**
 * Image tag - can be GitSha or SemVer.
 */
export type ImageTag = GitShaTag | SemVerTag | Brand<string, 'ImageTag'>

// ============================================================================
// Brand Constructors - Runtime helpers for creating branded types
// ============================================================================

/**
 * Create FQDN from string. Validates format at runtime.
 * @throws if string doesn't contain a dot
 */
export function fqdn(value: string): FQDN {
  if (!value.includes('.')) {
    throw new Error(`Invalid FQDN: "${value}" must contain at least one dot`)
  }
  return value as FQDN
}

/**
 * Create Host from string. Validates format at runtime.
 * @throws if string doesn't contain a dot
 */
export function host(value: string): Host {
  if (!value.includes('.')) {
    throw new Error(`Invalid Host: "${value}" must contain at least one dot`)
  }
  return value as Host
}

/**
 * Create Path from string. Validates format at runtime.
 * @throws if string doesn't start with /
 */
export function path(value: string): Path {
  if (!value.startsWith('/')) {
    throw new Error(`Invalid Path: "${value}" must start with /`)
  }
  return value as Path
}

/**
 * Create Port from number. Validates range at runtime.
 * @throws if port is not in valid range 1-65535
 */
export function port<N extends number>(value: N): Port<N> {
  if (value < 1 || value > 65535) {
    throw new Error(`Invalid Port: ${value} must be between 1 and 65535`)
  }
  return value as Port<N>
}

/**
 * Create URL from components.
 */
export function url<H extends string, P extends Path>(
  protocol: HttpProtocol,
  hostname: H,
  pathname: P
): Url<typeof protocol, H, P> {
  return `${protocol}://${hostname}${pathname}` as Url<typeof protocol, H, P>
}

/**
 * Create SecretRefString from namespace and key.
 */
export function secretRef(namespace: string, key: string): SecretRefString {
  return `secret://${namespace}/${key}` as SecretRefString
}


/**
 * Type guard to check if value is a branded type.
 */
export function isBranded<T extends { readonly __brand: string }>(
  value: unknown
): value is T {
  return typeof value === 'object' && value !== null && '__brand' in value
}
