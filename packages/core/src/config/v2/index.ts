/**
 * V2 Configuration exports
 */

export { defineConfigV2, createServiceContext } from './define-config.js'
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
} from './types.js'