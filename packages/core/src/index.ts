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

// V2 Configuration
export { defineConfigV2, createServiceContext } from './config/v2/index.js'
export type {
  // New recursive types
  NamespaceShape,
  NamespaceUnion,
  Dep,
  ServiceWithNeeds,
  DependsHelper,
  Tools,
  // Legacy types for backward compatibility
  ServiceDefinition,
  ServiceKind,
  Protocol,
  NetworkEndpoint,
  PublicEndpoint,
  ResourceProfile,
  ServiceDependency
} from './config/v2/index.js'
