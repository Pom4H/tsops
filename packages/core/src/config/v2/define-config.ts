/**
 * V2 configuration implementation with proper key inference
 */

import type { 
  NamespaceShape,
  NamespaceUnion,
  Dep,
  ServiceBase,
  DependsHelper,
  Tools,
  DependenciesOf
} from './types.js'

export function defineConfigV2<
  Project extends string,
  Namespaces extends Record<string, NamespaceShape>,
  S extends Record<string, ServiceBase>
>(config: {
  project: Project;
  namespaces: Namespaces;
  services: (
    ctx: NamespaceUnion<Namespaces> & Tools<keyof S & string>
  ) => S;
}): {
  readonly project: Project;
  readonly namespaces: Namespaces;
  getService<K extends keyof S>(name: K): S[K];
  getDependencies<K extends keyof S>(name: K): DependenciesOf<S, K>;
} {
  // Create a mock context for the services function
  // We need to create the tools with the correct keys, but we don't know them yet
  // So we'll create a mock that will be replaced when we call the services function
  const mockContext = {
    domain: 'mock.domain.com',
    debug: true,
    logLevel: 'debug',
    net: {
      http: (port: number) => ({ protocol: 'http', port })
    },
    expose: {
      httpsHost: (domain: string) => ({ host: domain, protocol: 'https' as const })
    },
    res: {
      smol: { cpu: '100m', memory: '128Mi', replicas: 1 },
      medium: { cpu: '500m', memory: '512Mi', replicas: 2 }
    },
    depends: {
      // БЫЛО: <N extends string, P extends number>
      on: <N extends keyof S & string, P extends number>(name: N, port: P): Dep<N, P> => ({
        service: name,
        port
      })
    }
  } as NamespaceUnion<Namespaces> & Tools<keyof S & string>

  // Call the services function to get the actual services
  const services = config.services(mockContext)

  return {
    project: config.project,
    namespaces: config.namespaces,
    getService: <K extends keyof S>(name: K): S[K] => {
      return services[name]
    },
    getDependencies: <K extends keyof S>(name: K): DependenciesOf<S, K> => {
      const service = services[name]
      if (service && 'needs' in service && service.needs) {
        return service.needs as DependenciesOf<S, K>
      }
      return [] as unknown as DependenciesOf<S, K>
    }
  }
}

// Legacy helper function for backward compatibility
export function createServiceContext<
  TProject extends string,
  TNamespaces extends Record<string, any>,
  TServices extends Record<string, any>
>(
  project: TProject,
  namespace: string,
  namespaceVars: TNamespaces[keyof TNamespaces],
  services: TServices
): any {
  return {
    project,
    namespace,
    ...namespaceVars,
    net: {
      http: (port: number) => ({ protocol: 'http', port }),
      https: (port: number) => ({ protocol: 'https', port }),
      tcp: (port: number) => ({ protocol: 'tcp', port }),
      udp: (port: number) => ({ protocol: 'udp', port }),
      grpc: (port: number) => ({ protocol: 'grpc', port })
    },
    expose: {
      httpsHost: (domain: string) => ({ host: domain, protocol: 'https' }),
      httpHost: (domain: string) => ({ host: domain, protocol: 'http' }),
      custom: (host: string, protocol: 'http' | 'https') => ({ host, protocol })
    },
    res: {
      smol: { cpu: '100m', memory: '128Mi', replicas: 1 },
      medium: { cpu: '500m', memory: '512Mi', replicas: 2 },
      large: { cpu: '1000m', memory: '1Gi', replicas: 3 }
    },
    service: {
      url: (name: keyof TServices) => `${project}-${String(name)}.${namespace}.svc.cluster.local`,
      internal: (name: keyof TServices) => `${project}-${String(name)}.${namespace}.svc.cluster.local`,
      external: (name: keyof TServices) => undefined
    },
    depends: {
      on: (service: keyof TServices, port: number) => ({
        service: String(service),
        port
      })
    },
    env: (key: string, fallback?: string) => process.env[key] || fallback || '',
    secret: (name: string, key?: string) => ({ __type: 'SecretRef', secretName: name, key }),
    configMap: (name: string, key?: string) => ({ __type: 'ConfigMapRef', configMapName: name, key }),
    template: (str: string, vars: Record<string, string>) => str.replace(/\{(\w+)\}/g, (match, key) => vars[key] || match)
  }
}