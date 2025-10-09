/**
 * Network topology validation and type computation
 * Validates service dependencies at compile time
 */

import type { ServiceDefinition, ServiceDependency } from './types.js'

/**
 * Extract service names from services configuration
 */
export type ExtractServiceNames<T> = T extends Record<string, ServiceDefinition> 
  ? keyof T 
  : never

/**
 * Extract service dependencies from a specific service
 */
export type ExtractServiceDependencies<T, K extends keyof T> = 
  T[K] extends ServiceDefinition 
    ? T[K]['needs'][number]['service']
    : never

/**
 * Check if a service has a public endpoint (expose)
 */
export type HasPublicEndpoint<T, K extends keyof T> = 
  T[K] extends ServiceDefinition 
    ? T[K]['public'] extends undefined 
      ? false 
      : true
    : false

/**
 * Get service listen port
 */
export type GetServicePort<T, K extends keyof T> = 
  T[K] extends ServiceDefinition 
    ? T[K]['listen']['port']
    : never

/**
 * Get service listen protocol
 */
export type GetServiceProtocol<T, K extends keyof T> = 
  T[K] extends ServiceDefinition 
    ? T[K]['listen']['protocol']
    : never

/**
 * Validate that a dependency service exists
 */
export type ValidateDependencyExists<
  TServices extends Record<string, ServiceDefinition>,
  TDependency extends string
> = TDependency extends ExtractServiceNames<TServices> 
  ? TDependency 
  : {
      __error: `Service '${TDependency}' not found in services configuration`
      __availableServices: ExtractServiceNames<TServices>
    }

/**
 * Validate that a dependency service has the required port
 */
export type ValidateDependencyPort<
  TServices extends Record<string, ServiceDefinition>,
  TServiceName extends string,
  TPort extends number
> = TServiceName extends ExtractServiceNames<TServices>
  ? GetServicePort<TServices, TServiceName> extends TPort
    ? TServiceName
    : {
        __error: `Service '${TServiceName}' does not listen on port ${TPort}`
        __actualPort: GetServicePort<TServices, TServiceName>
        __expectedPort: TPort
      }
  : ValidateDependencyExists<TServices, TServiceName>

/**
 * Validate that a dependency service has the required protocol
 */
export type ValidateDependencyProtocol<
  TServices extends Record<string, ServiceDefinition>,
  TServiceName extends string,
  TProtocol extends string
> = TServiceName extends ExtractServiceNames<TServices>
  ? GetServiceProtocol<TServices, TServiceName> extends TProtocol
    ? TServiceName
    : {
        __error: `Service '${TServiceName}' does not use protocol '${TProtocol}'`
        __actualProtocol: GetServiceProtocol<TServices, TServiceName>
        __expectedProtocol: TProtocol
      }
  : ValidateDependencyExists<TServices, TServiceName>

/**
 * Validate a single dependency
 */
export type ValidateDependency<
  TServices extends Record<string, ServiceDefinition>,
  TDependency extends ServiceDependency<any>
> = TDependency['service'] extends string
  ? ValidateDependencyPort<
      TServices,
      TDependency['service'],
      TDependency['port']
    > extends infer TValidatedService
    ? TDependency['protocol'] extends string
      ? ValidateDependencyProtocol<
          TServices,
          TValidatedService extends string ? TValidatedService : never,
          TDependency['protocol']
        >
      : TValidatedService
    : never
  : never

/**
 * Validate all dependencies for a service
 */
export type ValidateServiceDependencies<
  TServices extends Record<string, ServiceDefinition>,
  TServiceName extends keyof TServices
> = TServices[TServiceName] extends ServiceDefinition
  ? TServices[TServiceName]['needs'] extends readonly ServiceDependency<any>[]
    ? {
        [K in keyof TServices[TServiceName]['needs']]: ValidateDependency<
          TServices,
          TServices[TServiceName]['needs'][K]
        >
      }
    : never
  : never

/**
 * Validate all services dependencies
 */
export type ValidateAllDependencies<
  TServices extends Record<string, ServiceDefinition>
> = {
  [K in keyof TServices]: ValidateServiceDependencies<TServices, K>
}

/**
 * Check if there are any validation errors
 */
export type HasValidationErrors<T> = T extends Record<string, any>
  ? {
      [K in keyof T]: T[K] extends { __error: any }
        ? T[K]
        : T[K] extends Record<string, any>
        ? HasValidationErrors<T[K]>
        : never
    }[keyof T]
  : never

/**
 * Extract all validation errors
 */
export type ExtractValidationErrors<T> = T extends Record<string, any>
  ? {
      [K in keyof T]: T[K] extends { __error: infer E }
        ? { service: K; error: E }
        : T[K] extends Record<string, any>
        ? ExtractValidationErrors<T[K]>
        : never
    }[keyof T]
  : never

/**
 * Network topology information
 */
export interface NetworkTopology<T extends Record<string, ServiceDefinition>> {
  services: ExtractServiceNames<T>[]
  connections: Array<{
    from: ExtractServiceNames<T>
    to: ExtractServiceNames<T>
    port: number
    protocol: string
  }>
  publicEndpoints: Array<{
    service: ExtractServiceNames<T>
    host: string
    protocol: 'http' | 'https'
  }>
}

/**
 * Compute network topology from services configuration
 */
export type ComputeTopology<T extends Record<string, ServiceDefinition>> = 
  HasValidationErrors<ValidateAllDependencies<T>> extends never
    ? NetworkTopology<T>
    : {
        __error: 'Network topology validation failed'
        __errors: ExtractValidationErrors<ValidateAllDependencies<T>>
      }

/**
 * Type helper to check if configuration is valid
 */
export type IsValidConfiguration<T> = 
  HasValidationErrors<T> extends never ? true : false

/**
 * Type helper to get validation errors
 */
export type GetValidationErrors<T> = 
  HasValidationErrors<T> extends never ? never : ExtractValidationErrors<T>