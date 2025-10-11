/**
 * V2 Configuration exports
 */

export { defineConfigV2, createServiceContext } from './define-config.js'
export type {
  // New key inference types
  NamespaceShape,
  NamespaceUnion,
  Dep,
  ServiceBase,
  DependsHelper,
  Tools,
  DependenciesOf,
  // Legacy types for backward compatibility
  ServiceDefinition,
  ServiceKind,
  Protocol,
  NetworkEndpoint,
  PublicEndpoint,
  ResourceProfile,
  ServiceDependency
} from './types.js'