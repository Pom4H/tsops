import type { 
  AppHostContextWithHelpers,
  TsOpsConfig,
  SecretRef, 
  ConfigMapRef,
  ServiceDNSOptions,
  ClusterMetadata,
  ResourceKind,
  ExtractNamespaceVarsFromConfig
} from '../types.js'
import type { ProjectResolver } from './project.js'
import type { EnvironmentProvider } from '../environment-provider.js'

export interface CreateHostContextOptions {
  appName?: string
  cluster?: ClusterMetadata
}

export interface NamespaceResolver<
  TConfig extends TsOpsConfig<any, any, any, any, any, any, any>
> {
  select(target?: string): string[]
  createHostContext(
    namespace: string, 
    options?: CreateHostContextOptions
  ): AppHostContextWithHelpers<
    ExtractNamespaceVarsFromConfig<TConfig>,
    TConfig['project'],
    Extract<keyof TConfig['namespaces'], string>,
    TConfig['secrets'],
    TConfig['configMaps'],
    TConfig['apps']
  >
}

export function createNamespaceResolver<
  TConfig extends TsOpsConfig<any, any, any, any, any, any, any>
>(
  config: TConfig,
  project: ProjectResolver<TConfig>,
  envProvider: EnvironmentProvider
): NamespaceResolver<TConfig> {
  function select(target?: string): string[] {
    if (target) {
      if (!config.namespaces[target as keyof TConfig['namespaces']]) {
        throw new Error(`Unknown namespace: ${target}`)
      }
      return [target]
    }

    return Object.keys(config.namespaces)
  }

  function createHostContext(
    namespace: string,
    options: CreateHostContextOptions = {}
  ): AppHostContextWithHelpers<
    ExtractNamespaceVarsFromConfig<TConfig>,
    TConfig['project'],
    Extract<keyof TConfig['namespaces'], string>,
    TConfig['secrets'],
    TConfig['configMaps'],
    TConfig['apps']
  > {
    const metadata = config.namespaces[namespace as keyof TConfig['namespaces']]
    if (!metadata) throw new Error(`Unknown namespace: ${namespace}`)
    
    const projectName = config.project
    const { appName = '', cluster = { name: '', apiServer: '', context: '' } } = options
    
    // Create secret helper with overload support
    const secret = ((secretName: string, key?: string): SecretRef => {
      if (key !== undefined) {
        return { __type: 'SecretRef' as const, secretName, key }
      }
      return { __type: 'SecretRef' as const, secretName }
    }) as {
      (secretName: string): SecretRef
      (secretName: string, key: string): SecretRef
    }

    // Create configMap helper with overload support
    const configMap = ((configMapName: string, key?: string): ConfigMapRef => {
      if (key !== undefined) {
        return { __type: 'ConfigMapRef' as const, configMapName, key }
      }
      return { __type: 'ConfigMapRef' as const, configMapName }
    }) as {
      (configMapName: string): ConfigMapRef
      (configMapName: string, key: string): ConfigMapRef
    }
    
    // Enhanced serviceDNS with options support
    const serviceDNS = (app: Extract<keyof TConfig['apps'], string>, options?: number | ServiceDNSOptions): string => {
      // Backward compatibility: number -> port
      if (typeof options === 'number') {
        const dns = `${app}.${namespace}.svc.cluster.local`
        return `${dns}:${options}`
      }
      
      if (!options) {
        return `${app}.${namespace}.svc.cluster.local`
      }
      
      const {
        port,
        protocol,
        headless = false,
        podIndex,
        external = false,
        clusterDomain = 'cluster.local'
      } = options
      
      let dns: string
      
      if (external) {
        dns = app
      } else if (headless) {
        if (podIndex !== undefined) {
          dns = `${app}-${podIndex}.${app}.${namespace}.svc.${clusterDomain}`
        } else {
          dns = `${app}.${namespace}.svc.${clusterDomain}`
        }
      } else {
        dns = `${app}.${namespace}.svc.${clusterDomain}`
      }
      
      if (protocol) {
        dns = `${protocol}://${dns}`
      }
      
      if (port) {
        dns = `${dns}:${port}`
      }
      
      return dns
    }
    
    // Label generator
    const label = (key: string, value?: string): string => {
      const labelValue = value || appName
      return `app.kubernetes.io/${key}=${labelValue}`
    }
    
    // Resource name generator
    const resource = (kind: ResourceKind, name: string): string => {
      const suffix = kind === 'sa' || kind === 'serviceaccount' ? '' : `-${kind}`
      return appName 
        ? `${appName}-${name}${suffix}`
        : `${name}${suffix}`
    }
    
    // Environment variable getter
    const env = <T extends string = string>(key: string, fallback?: T): T => {
      const value = envProvider.get(key)
      if (value !== undefined) {
        return value as T
      }
      if (fallback !== undefined) {
        return fallback
      }
      return '' as T
    }
    
    // Template string helper
    const template = (str: string, vars: Record<string, string>): string => {
      return str.replace(/\{(\w+)\}/g, (_, key) => vars[key] || '')
    }
    
    // Create context with helpers and spread namespace variables
    return {
      // Metadata
      project: projectName,
      namespace,
      appName,
      cluster,
      
      // Generators
      serviceDNS,
      label,
      resource,
      
      // Secrets & ConfigMaps
      secret,
      configMap,
      
      // Utilities
      env,
      template,
      
      // ✨ Spread all namespace variables into context
      ...metadata
    } as AppHostContextWithHelpers<
      ExtractNamespaceVarsFromConfig<TConfig>,
      TConfig['project'],
      Extract<keyof TConfig['namespaces'], string>,
      TConfig['secrets'],
      TConfig['configMaps']
    >
  }

  return {
    select,
    createHostContext
  }
}

/**
 * Standalone serviceDNS utility function for building Kubernetes service DNS names.
 * This is used by runtime-config.ts to build internal endpoints consistently.
 * 
 * @param serviceName - Service name
 * @param namespace - Kubernetes namespace
 * @param port - Port number
 * @param options - Additional options
 * @returns Service DNS name with protocol and port
 */
export function buildServiceDNS(
  serviceName: string,
  namespace: string,
  port: number | string,
  options: { protocol?: 'http' | 'https' | 'tcp' | 'udp'; clusterDomain?: string } = {}
): string {
  const portNum = typeof port === 'string' ? port : port
  const { protocol = 'http', clusterDomain = 'cluster.local' } = options
  
  const dns = `${serviceName}.${namespace}.svc.${clusterDomain}`
  
  if (protocol) {
    return `${protocol}://${dns}:${portNum}`
  }
  
  return `${dns}:${portNum}`
}
