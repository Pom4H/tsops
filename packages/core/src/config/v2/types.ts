/**
 * V2 configuration types with recursive dependency validation
 */

// ===== Core helper types =====
export type NamespaceShape = {
  domain: string;
  debug: boolean;
  logLevel: string;
} & Record<string, unknown>;

export type NamespaceUnion<N extends Record<string, NamespaceShape>> =
  N[keyof N];

export type Dep<Name extends string, Port extends number = number> = {
  service: Name;
  port: Port;
};

export type ServiceWithNeeds<S extends Record<string, object>> =
  { needs: readonly Dep<string, number>[] } & Record<string, unknown>;

export interface DependsHelper<S extends Record<string, object>> {
  on<N extends keyof S & string, P extends number>(name: N, port: P): Dep<N, P>;
}

export type Tools<S extends Record<string, object>> = {
  net: { http: (port: number) => unknown };
  expose: { httpsHost: (domain: string) => unknown };
  res: { smol: unknown; medium: unknown };
  depends: DependsHelper<S>;
};

// ===== Legacy types for backward compatibility =====
export type Protocol = 'http' | 'https' | 'tcp' | 'udp' | 'grpc'

export type ServiceKind = 'api' | 'gateway' | 'worker' | 'database' | 'cache' | 'queue'

export interface NetworkEndpoint {
  protocol: Protocol
  port: number
  path?: string
}

export interface PublicEndpoint {
  host: string
  protocol: 'http' | 'https'
  path?: string
}

export interface ResourceProfile {
  cpu: string
  memory: string
  storage?: string
  replicas: number
}

export interface ServiceDependency {
  service: string
  port: number
  protocol: Protocol
  description?: string
  optional?: boolean
}

export interface ServiceDefinition {
  kind: ServiceKind
  listen: NetworkEndpoint
  public?: PublicEndpoint
  needs: ServiceDependency[]
  resources: ResourceProfile
  description?: string
}

// ===== Final defineConfigV2 type =====
export declare function defineConfigV2<
  Project extends string,
  Namespaces extends Record<string, NamespaceShape>,
  S extends Record<string, ServiceWithNeeds<S>>
>(config: {
  project: Project;
  namespaces: Namespaces;
  services: (ctx: NamespaceUnion<Namespaces> & Tools<S>) => S;
}): {
  readonly project: Project;
  readonly namespaces: Namespaces;
  getService<K extends keyof S>(name: K): S[K];
  getDependencies<K extends keyof S>(
    name: K
  ): S[K] extends { needs: infer D } ? Readonly<D> : readonly [];
};