/**
 * Runtime utilities for pruned service configurations
 */

export { useConfig, useConfigFromJSON } from './use-config.js'
export type { 
  ServiceEndpoint, 
  ServiceConfig, 
  EnvironmentReference, 
  PrunedConfig,
  UseConfigReturn 
} from './use-config.js'