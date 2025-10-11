/**
 * V2 configuration types with proper key inference
 */

// ===== Base shapes =====
export type NamespaceShape = {
  domain: string;
  debug: boolean;
  logLevel: string;
} & Record<string, unknown>;

export type NamespaceUnion<N extends Record<string, NamespaceShape>> = N[keyof N];

// Зависимость на сервис + порт
export type Dep<Name extends string, Port extends number = number> = {
  service: Name;
  port: Port;
};

// Минимальный shape сервиса (можно расширять по вашему DSL)
export type ServiceBase = {
  needs?: readonly Dep<string, number>[];
} & Record<string, unknown>;

// ===== Depends/Tools, привязанные к множеству ключей, а не ко всему S =====
export interface DependsHelper<Keys extends string> {
  on<Name extends Keys, P extends number>(name: Name, port: P): Dep<Name, P>;
}

export type Tools<Keys extends string> = {
  net: { http: (port: number) => unknown };
  expose: { httpsHost: (domain: string) => unknown };
  res: { smol: unknown; medium: unknown };
  depends: DependsHelper<Keys>;
};

// ===== Вспомогательные типы для вывода топологии =====
export type DependenciesOf<
  S extends Record<string, ServiceBase>,
  K extends keyof S
> = S[K] extends { needs: infer D }
  ? Readonly<D> extends readonly Dep<any, any>[]
    ? Readonly<D>
    : readonly []
  : readonly [];

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

// ===== Главная сигнатура defineConfigV2 =====
export declare function defineConfigV2<
  Project extends string,
  Namespaces extends Record<string, NamespaceShape>,
  // S будет ИНФЕРЕН колбэком services по возвращаемому объекту
  S extends Record<string, ServiceBase>
>(config: {
  project: Project;
  namespaces: Namespaces;

  // Важный момент: Tools параметризуем ключами S (keyof S & string),
  // а сам S выводится из возвращаемого значения фабрики.
  services: (
    ctx: NamespaceUnion<Namespaces> & Tools<keyof S & string>
  ) => S;
}): {
  readonly project: Project;
  readonly namespaces: Namespaces;

  getService<K extends keyof S>(name: K): S[K];

  getDependencies<K extends keyof S>(name: K): DependenciesOf<S, K>;
};