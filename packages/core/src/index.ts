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

// New v2 configuration
export { defineConfigV2 } from './config/v2/index.js'
export type { 
  ServiceDefinition, 
  ServiceContext, 
  TsOpsConfigV2 
} from './config/v2/index.js'

// Runtime utilities
export { useConfig, useConfigFromJSON } from './runtime/index.js'
export type { 
  ServiceEndpoint, 
  ServiceConfig, 
  EnvironmentReference, 
  PrunedConfig 
} from './runtime/index.js'
