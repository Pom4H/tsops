export * from './tsops.js'
export * from './types.js'
export * from './logger.js'
export * from './config/resolver.js'
export * from './operations/index.js'
export * from './environment-provider.js'
export * from './runtime-config.js'
export * from './ports/docker.js'
export * from './ports/kubectl.js'

export { defineConfig } from './config/definer.js'
export type { TsOpsConfigWithRuntime } from './config/definer.js'

// Dynamic Infrastructure DSL
// Note: SecretRef in types.js is different from SecretRefString in dsl
export {
  defineDSL,
  resolveDSL,
  getExternalEndpoint,
  getInternalEndpoint,
  createHelpers,
  fqdn,
  host,
  path,
  port,
  url,
  secretRef,
  runtimeValidate
} from './dsl/index.js'

// Re-export DSL types (avoiding conflict with types.ts SecretRef)
export type {
  FQDN,
  Host,
  Path,
  Port,
  HttpProtocol,
  Url,
  SecretRefString,
  GitShaTag,
  SemVerTag,
  ImageTag,
  Regions,
  Namespace,
  Namespaces,
  Cluster,
  Clusters,
  Core,
  TypedCore,
  Surface,
  SurfaceHTTP,
  SurfaceTCP,
  Service,
  Services,
  Images,
  ImageDef,
  IngressRule,
  TLSPolicy,
  EnvRule,
  EnvSpec,
  EnvScope,
  EnvKind,
  NoCycle,
  DistinctHosts,
  RequireSecretsInProd,
  Helpers,
  DynamicConfig
} from './dsl/index.js'
