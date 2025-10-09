/**
 * New configuration schema with typed service dependencies
 * Export all types and functions for external use
 */

export { defineConfigV2Simple as defineConfigV2 } from './define-config-v2-simple.js'
export type {
  ServiceDefinition,
  ServiceContext,
  BaseServiceContext,
  ServiceKind,
  NetworkEndpoint,
  PublicEndpoint,
  ResourceProfile,
  ServiceDependency,
  TsOpsConfigV2,
  InferServiceNames,
  InferServiceDependencies,
  InferServiceKind,
  ValidateServiceDependencies,
  ValidateCircularDependencies,
  PrunedConfig,
  ExtractNamespaceVars
} from './types.js'

export {
  createNetworkHelpers,
  createExposeHelpers,
  createResourceHelpers,
  createServiceHelpers,
  createDependencyHelpers,
  createEnvironmentHelpers,
  createServiceContext
} from './helpers.js'

export {
  createTypedDependencyHelpers,
  createTypedServiceHelpers,
  createTypedNetworkHelpers,
  createTypedExposeHelpers,
  createTypedResourceHelpers,
  createTypedEnvironmentHelpers
} from './typed-helpers.js'