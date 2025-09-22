import { exec as execCb, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import path from 'path';
import { promisify } from 'util';
import {
  DeployPipelineConfig,
  EnvironmentConfig,
  EnvironmentRuntimeInfo,
  ExecFn,
  GitInfo,
  Hook,
  HookContext,
  IngressManifest,
  KubernetesManifest,
  KubectlClient,
  NotificationChannelConfig,
  NotificationTemplateArgs,
  ServiceConfig,
  ServiceManifest,
  ServiceManifestContext,
  ServiceRuntime,
  IngressControllerConfig,
  TsOpsConfig,
} from '../types';

const execAsync = promisify(execCb);

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
  debug?(message: string): void;
}

export interface NotificationDispatchInput {
  event: string;
  channel: string;
  config: NotificationChannelConfig;
  message: string;
  args: NotificationTemplateArgs;
}

export type NotificationDispatcher = (
  input: NotificationDispatchInput,
) => Promise<void> | void;

export interface DeployOptions {
  environment?: string;
  diff?: boolean;
  diffOnly?: boolean;
  skipHooks?: boolean;
  notify?: boolean;
  imageTag?: string;
  git?: GitInfo;
}

export interface BuildOptions {
  environment?: string;
  env?: Record<string, string>;
  git?: GitInfo;
}

export interface TestOptions {
  git?: GitInfo;
}

export interface TsOpsOptions {
  cwd?: string;
  exec?: ExecFn;
  kubectl?: KubectlClient;
  logger?: Logger;
  notificationDispatcher?: NotificationDispatcher;
}

const defaultLogger: Logger = {
  info: (message) => console.log(`[tsops] ${message}`),
  warn: (message) => console.warn(`[tsops] ${message}`),
  error: (message, error) => {
    console.error(`[tsops] ${message}`);
    if (error) {
      console.error(error);
    }
  },
  debug: (message) => {
    if (process.env.TSOPS_DEBUG === '1') {
      console.debug(`[tsops] ${message}`);
    }
  },
};

const defaultNotificationDispatcher: NotificationDispatcher = async ({
  event,
  channel,
  message,
}) => {
  defaultLogger.info(`notification:${event} -> ${channel}: ${message}`);
};

const serializeManifests = (manifests: KubernetesManifest[]): string => {
  if (manifests.length === 0) {
    return '';
  }

  const documents = manifests
    .map((manifest) => JSON.stringify(manifest, null, 2))
    .join('\n---\n');

  return `---\n${documents}`;
};

const quoteArgs = (args: string[]): string =>
  args
    .map((value) => {
      if (/^[A-Za-z0-9_.:\/-]+$/.test(value)) {
        return value;
      }
      return `'${value.replace(/'/g, "'\\''")}'`;
    })
    .join(' ');

export class TsOps {
  private readonly config: TsOpsConfig;
  private readonly execFn: ExecFn;
  private readonly kubectl: KubectlClient;
  private readonly logger: Logger;
  private readonly notificationDispatcher: NotificationDispatcher;
  private readonly cwd: string;
  private readonly ensuredIngressControllers = new Set<string>();

  constructor(config: TsOpsConfig, options: TsOpsOptions = {}) {
    this.config = config;
    this.cwd = options.cwd ?? process.cwd();
    this.logger = options.logger ?? defaultLogger;
    this.notificationDispatcher =
      options.notificationDispatcher ?? defaultNotificationDispatcher;
    this.execFn = options.exec ?? ((command, execOptions) => this.runCommand(command, execOptions));
    this.kubectl = options.kubectl ?? this.createKubectlClient();
  }

  async build(serviceName: string, options: BuildOptions = {}): Promise<void> {
    const service = this.resolveService(serviceName);
    const environment = this.resolveEnvironmentForService(
      service,
      options.environment,
    );
    const git = options.git ?? (await this.detectGitInfo());

    const envRuntime: EnvironmentRuntimeInfo = {
      name: environment.name,
      namespace: environment.namespace,
    };

    const envVars: Record<string, string> = {
      SERVICE_NAME: service.name,
      ENVIRONMENT: envRuntime.name,
      ...(options.env ?? {}),
    };

    this.logger.info(
      `Running build pipeline for service "${service.name}" in env "${envRuntime.name}"`,
    );

    await this.config.pipeline.build.run({
      exec: this.execFn,
      env: envVars,
      service: this.createServiceRuntime(service),
      environment: envRuntime,
      git,
    });
  }

  async buildAll(
    environmentName?: string,
    options: BuildOptions = {},
  ): Promise<void> {
    const order = this.getServiceDeploymentOrder();
    if (order.length === 0) {
      this.logger.warn('No services configured for build; nothing to do.');
      return;
    }

    const git = options.git ?? (await this.detectGitInfo());

    for (const serviceName of order) {
      await this.build(serviceName, {
        ...options,
        environment: environmentName ?? options.environment,
        git,
      });
    }
  }

  async test(options: TestOptions = {}): Promise<void> {
    const git = options.git ?? (await this.detectGitInfo());

    this.logger.info('Running test pipeline');

    await this.config.pipeline.test.run({
      exec: this.execFn,
      git,
    });
  }

  async deploy(
    serviceName: string,
    environmentName?: string,
    options: DeployOptions = {},
  ): Promise<void> {
    const service = this.resolveService(serviceName);
    const environment = this.resolveEnvironmentForService(
      service,
      environmentName ?? options.environment,
    );
    const git = options.git ?? (await this.detectGitInfo());

    const serviceRuntime = this.createServiceRuntime(service);
    const envRuntime: EnvironmentRuntimeInfo = {
      name: environment.name,
      namespace: environment.namespace,
    };

    const manifestsInfo = this.renderManifests(
      service,
      environment,
      git,
      options.imageTag,
    );

    await this.ensureIngressController(environment);

    if (environment.tls?.selfSigned?.enabled) {
      await this.ensureSelfSignedTlsSecrets(service, environment, manifestsInfo.manifests);
    }

    const hookContext: Partial<HookContext> = {
      exec: this.execFn,
      kubectl: this.kubectl,
      git,
      environment,
      service: serviceRuntime,
    };

    if (!options.skipHooks) {
      await this.runHooks(this.config.hooks?.beforeDeploy, hookContext);
    }

    if (options.diff || options.diffOnly) {
      await this.runDiff(this.config.pipeline.deploy, environment, manifestsInfo.manifests);
      if (options.diffOnly) {
        return;
      }
    }

    try {
      await this.config.pipeline.deploy.run({
        kubectl: this.kubectl,
        environment,
        service: serviceRuntime,
        config: this.config,
        git,
        manifests: manifestsInfo.manifests,
      });

      if (!options.skipHooks) {
        await this.runHooks(this.config.hooks?.afterDeploy, hookContext);
      }

      if (options.notify ?? true) {
        await this.notify('deploySuccess', {
          service: serviceRuntime,
          environment: envRuntime,
          git,
        });
      }

      this.logger.info(
        `Deploy pipeline finished for service "${service.name}" in env "${environment.name}"`,
      );
    } catch (error) {
      if (!options.skipHooks) {
        await this.runHooks(this.config.hooks?.onFailure, {
          ...hookContext,
          service: serviceRuntime,
        });
      }

      if (options.notify ?? true) {
        await this.notify(
          'deployFailure',
          {
            service: serviceRuntime,
            environment: envRuntime,
            git,
            error,
          },
          'failure',
        );
      }

      throw error;
    }
  }

  async deployAll(
    environmentName?: string,
    options: DeployOptions = {},
  ): Promise<void> {
    const order = this.getServiceDeploymentOrder();
    if (order.length === 0) {
      this.logger.warn('No services configured for deployment; nothing to do.');
      return;
    }

    const git = options.git ?? (await this.detectGitInfo());

    for (const serviceName of order) {
      await this.deploy(serviceName, environmentName ?? options.environment, {
        ...options,
        git,
      });
    }
  }

  async getGitInfo(): Promise<GitInfo> {
    return this.detectGitInfo();
  }

  private async runDiff(
    deployConfig: DeployPipelineConfig,
    environment: EnvironmentConfig & { name: string },
    manifests: KubernetesManifest[],
  ): Promise<void> {
    if (!deployConfig.diff) {
      this.logger.warn('diff requested but no diff handler configured; skipping');
      return;
    }

    this.logger.info(
      `Running diff for environment "${environment.name}" (${manifests.length} manifest${
        manifests.length === 1 ? '' : 's'
      })`,
    );

    await deployConfig.diff({
      kubectl: this.kubectl,
      environment,
      manifests,
    });
  }

  private resolveEnvironmentForService(
    service: ServiceConfig & { name: string },
    explicitEnvironment?: string,
  ): EnvironmentConfig & { name: string } {
    const environmentName =
      explicitEnvironment ?? service.defaultEnvironment ?? this.defaultEnvironment();

    if (!environmentName) {
      throw new Error(
        `Environment not specified for service "${service.name}" and no default found`,
      );
    }

    return this.resolveEnvironment(environmentName);
  }

  private defaultEnvironment(): string | undefined {
    const candidate = Object.keys(this.config.environments);
    return candidate.length === 1 ? candidate[0] : undefined;
  }

  private resolveService(
    serviceName: string,
  ): ServiceConfig & { name: string } {
    const service = this.config.services[serviceName];
    if (!service) {
      throw new Error(`Unknown service "${serviceName}"`);
    }
    return { ...service, name: serviceName };
  }

  private resolveEnvironment(
    environmentName: string,
  ): EnvironmentConfig & { name: string } {
    const environment = this.config.environments[environmentName];
    if (!environment) {
      throw new Error(`Unknown environment "${environmentName}"`);
    }
    return { ...environment, name: environmentName };
  }

  private createServiceRuntime(
    service: ServiceConfig & { name: string },
  ): ServiceRuntime {
    return {
      name: service.name,
      releaseName: service.releaseName,
      containerImage: service.containerImage,
    };
  }

  private async detectGitInfo(): Promise<GitInfo> {
    try {
      const branch = (
        await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: this.cwd })
      ).stdout.trim();
      const sha = (
        await execAsync('git rev-parse HEAD', { cwd: this.cwd })
      ).stdout.trim();
      const shortSha = (
        await execAsync('git rev-parse --short HEAD', { cwd: this.cwd })
      ).stdout.trim();

      let tag: string | undefined;
      try {
        const result = await execAsync('git describe --tags --abbrev=0', {
          cwd: this.cwd,
        });
        tag = result.stdout.trim() || undefined;
      } catch (error) {
        this.logger.debug?.(
          `git describe failed while detecting git info: ${String(error)}`,
        );
      }

      const status = (
        await execAsync('git status --porcelain', { cwd: this.cwd })
      ).stdout.trim();

      return {
        branch,
        sha,
        shortSha,
        tag,
        hasUncommittedChanges: status.length > 0,
      };
    } catch (error) {
      const fallbackId = randomUUID().replace(/-/g, '');
      const fallbackSha = (fallbackId + fallbackId).slice(0, 40);
      const fallbackShort = fallbackSha.slice(0, 7);

      this.logger.warn(
        `Failed to detect git information in ${this.cwd}; using fallback metadata (${fallbackShort}). ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        branch: 'unknown',
        sha: fallbackSha,
        shortSha: fallbackShort,
        tag: undefined,
        hasUncommittedChanges: false,
      };
    }
  }

  private renderManifests(
    service: ServiceConfig & { name: string },
    environment: EnvironmentConfig & { name: string },
    git: GitInfo,
    explicitImageTag?: string,
  ): { manifests: KubernetesManifest[]; imageTag: string; context: ServiceManifestContext } {
    const imageTag =
      explicitImageTag ??
      (this.config.buildImageTag
        ? this.config.buildImageTag(service, environment, git)
        : git.shortSha);

    const context: ServiceManifestContext = {
      env: {
        name: environment.name,
        namespace: environment.namespace,
      },
      image: `${service.containerImage}:${imageTag}`,
    };

    let manifests: KubernetesManifest[];
    if (this.config.renderManifests) {
      manifests = this.config.renderManifests({
        environment,
        service,
        imageTag,
      });
    } else {
      manifests = this.applyEnvOverrideManifests(service, context, environment.name);
    }

    const manifestsWithIngress = this.appendIngressManifests(
      manifests,
      service,
      environment,
    );

    return { manifests: manifestsWithIngress, imageTag, context };
  }

  private applyEnvOverrideManifests(
    service: ServiceConfig & { name: string },
    context: ServiceManifestContext,
    environmentName: string,
  ): KubernetesManifest[] {
    const override = service.envOverrides?.[environmentName]?.manifests;
    return override ? override(context) : service.manifests(context);
  }

  private appendIngressManifests(
    baseManifests: KubernetesManifest[],
    service: ServiceConfig & { name: string },
    environment: EnvironmentConfig & { name: string },
  ): KubernetesManifest[] {
    const ingressManifests = this.buildIngressManifests(
      baseManifests,
      service,
      environment,
    );

    return ingressManifests.length > 0
      ? [...baseManifests, ...ingressManifests]
      : baseManifests;
  }

  private buildIngressManifests(
    baseManifests: KubernetesManifest[],
    service: ServiceConfig & { name: string },
    environment: EnvironmentConfig & { name: string },
  ): IngressManifest[] {
    const ingressConfig = service.ingress;
    if (!ingressConfig) {
      return [];
    }

    const baseContainsIngress = baseManifests.some(
      (manifest) => (manifest as { kind?: string }).kind === 'Ingress',
    );
    if (baseContainsIngress) {
      return [];
    }

    const serviceManifest = baseManifests.find(
      (manifest) => (manifest as { kind?: string }).kind === 'Service',
    ) as ServiceManifest | undefined;

    const defaultServicePort = serviceManifest?.spec.ports?.[0]?.name ??
      serviceManifest?.spec.ports?.[0]?.port;

    const manifests: IngressManifest[] = [];

    for (const [ingressKey, definition] of Object.entries(ingressConfig)) {
      if (!definition) {
        continue;
      }

      const entryPoints =
        definition.entryPoints ??
        (ingressKey === 'websecure' ? ['websecure'] : undefined);

      const tlsDefinitions =
        definition.tls ??
        (ingressKey === 'websecure'
          ? [
              {
                secretName: `${service.name}-tls`,
                hosts: Array.from(
                  new Set(definition.rules.map((rule) => rule.host)),
                ),
              },
            ]
          : undefined);

      const annotations: Record<string, string> = {
        ...(definition.annotations ?? {}),
      };
      if (entryPoints && entryPoints.length > 0) {
        annotations['traefik.ingress.kubernetes.io/router.entrypoints'] =
          entryPoints.join(',');
      }
      if (
        definition.className === 'traefik' &&
        tlsDefinitions &&
        tlsDefinitions.length > 0 &&
        annotations['traefik.ingress.kubernetes.io/router.tls'] === undefined
      ) {
        annotations['traefik.ingress.kubernetes.io/router.tls'] = 'true';
      }

      const rules = definition.rules.map((rule) => {
        const paths = rule.paths.map((pathConfig) => {
          const resolvedPort =
            pathConfig.servicePort ?? defaultServicePort;
          if (resolvedPort === undefined) {
            throw new Error(
              `Ingress definition "${ingressKey}" for service "${service.name}" is missing a servicePort and no default could be inferred.`,
            );
          }

          const portDefinition =
            typeof resolvedPort === 'number'
              ? { number: resolvedPort }
              : { name: resolvedPort };

          return {
            path: pathConfig.path ?? '/',
            pathType: pathConfig.pathType ?? 'Prefix',
            backend: {
              service: {
                name: service.name,
                port: portDefinition,
              },
            },
          };
        });

        return {
          host: rule.host,
          http: { paths },
        };
      });

      const ingressManifest: IngressManifest = {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        metadata: {
          name: definition.name ?? `${service.name}-${ingressKey}`,
          namespace: environment.namespace,
          labels: { app: service.name },
          annotations:
            Object.keys(annotations).length > 0 ? annotations : undefined,
        },
        spec: {
          ingressClassName: definition.className,
          tls: tlsDefinitions,
          rules,
        },
      };

      manifests.push(ingressManifest);
    }

    return manifests;
  }

  private getServiceDeploymentOrder(): string[] {
    const services = Object.keys(this.config.services);
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (serviceName: string): void => {
      if (visited.has(serviceName)) {
        return;
      }
      if (visiting.has(serviceName)) {
        throw new Error(`Circular dependency detected for service "${serviceName}"`);
      }

      const service = this.config.services[serviceName];
      if (!service) {
        throw new Error(`Unknown service "${serviceName}" while computing deployment order`);
      }

      visiting.add(serviceName);

      for (const dependency of service.dependsOn ?? []) {
        if (!this.config.services[dependency]) {
          throw new Error(
            `Service "${serviceName}" depends on unknown service "${dependency}"`,
          );
        }
        visit(dependency);
      }

      visiting.delete(serviceName);
      visited.add(serviceName);
      order.push(serviceName);
    };

    for (const serviceName of services) {
      visit(serviceName);
    }

    return order;
  }

  private async ensureIngressController(
    environment: EnvironmentConfig & { name: string },
  ): Promise<void> {
    const controller = environment.ingressController;
    if (!controller || !controller.autoInstall) {
      return;
    }

    const key = `${environment.cluster.context}:${controller.type}:${controller.namespace ?? 'kube-system'}`;
    if (this.ensuredIngressControllers.has(key)) {
      return;
    }

    switch (controller.type) {
      case 'traefik':
        await this.ensureTraefikController(environment, controller, this.ensuredIngressControllers.has(key));
        break;
      default:
        this.logger.warn(`Unsupported ingress controller type "${controller.type}"`);
        return;
    }

    this.ensuredIngressControllers.add(key);
  }

  private async ensureTraefikController(
    environment: EnvironmentConfig & { name: string },
    controller: IngressControllerConfig,
    alreadyEnsured: boolean,
  ): Promise<void> {
    const namespace = controller.namespace ?? 'kube-system';
    const context = environment.cluster.context;

    let deploymentExists = true;
    try {
      await execAsync(
        `kubectl --context ${context} --namespace ${namespace} get deployment traefik`,
        { cwd: this.cwd },
      );
    } catch {
      deploymentExists = false;
      this.logger.info(
        `Installing Traefik ingress controller into namespace "${namespace}" for context "${context}"`,
      );
    }

    if (alreadyEnsured && deploymentExists) {
      return;
    }

    const manifest = this.buildTraefikManifest(namespace, controller.serviceType ?? 'LoadBalancer');

    await this.runCommand(`kubectl --context ${context} apply -f -`, {
      input: manifest,
    });
  }

  private buildTraefikManifest(namespace: string, serviceType: 'LoadBalancer' | 'NodePort' | 'ClusterIP'): string {
    const serviceExtra =
      serviceType === 'NodePort'
        ? '  externalTrafficPolicy: Cluster\n  ports:\n    - name: web\n      port: 80\n      targetPort: web\n      nodePort: 32080\n    - name: websecure\n      port: 443\n      targetPort: websecure\n      nodePort: 32443'
        : '  ports:\n    - name: web\n      port: 80\n      targetPort: web\n    - name: websecure\n      port: 443\n      targetPort: websecure';

    return `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
---
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: traefik
spec:
  controller: traefik.io/ingress-controller
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: traefik
  namespace: ${namespace}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: traefik
rules:
  - apiGroups:
      - ""
    resources:
      - services
      - endpoints
      - secrets
    verbs:
      - get
      - list
      - watch
  - apiGroups:
      - extensions
      - networking.k8s.io
    resources:
      - ingresses
      - ingressclasses
    verbs:
      - get
      - list
      - watch
  - apiGroups:
      - extensions
      - networking.k8s.io
    resources:
      - ingresses/status
    verbs:
      - update
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: traefik
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: traefik
subjects:
  - kind: ServiceAccount
    name: traefik
    namespace: ${namespace}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: traefik
  namespace: ${namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: traefik
  template:
    metadata:
      labels:
        app: traefik
    spec:
      serviceAccountName: traefik
      containers:
        - name: traefik
          image: traefik:v2.10.7
          args:
            - --entrypoints.web.Address=:80
            - --entrypoints.websecure.Address=:443
            - --providers.kubernetesingress
            - --providers.kubernetesingress.ingressclass=traefik
            - --api.dashboard=true
          ports:
            - name: web
              containerPort: 80
            - name: websecure
              containerPort: 443
---
apiVersion: v1
kind: Service
metadata:
  name: traefik
  namespace: ${namespace}
spec:
  type: ${serviceType}
${serviceExtra}
  selector:
    app: traefik
`; }

  private async ensureSelfSignedTlsSecrets(
    service: ServiceConfig & { name: string },
    environment: EnvironmentConfig & { name: string },
    manifests: KubernetesManifest[],
  ): Promise<void> {
    const tlsConfig = environment.tls?.selfSigned;
    if (!tlsConfig?.enabled) {
      return;
    }

    const ingressManifests = manifests.filter(
      (manifest): manifest is IngressManifest =>
        (manifest as { kind?: string }).kind === 'Ingress',
    );

    if (ingressManifests.length === 0) {
      return;
    }

    const tlsSecrets = new Map<string, Set<string>>();

    for (const ingress of ingressManifests) {
      const spec = (ingress as { spec?: unknown }).spec as
        | {
            tls?: Array<{ secretName?: string; hosts?: string[] }>;
          }
        | undefined;
      const tlsEntries = Array.isArray(spec?.tls) ? spec?.tls : [];
      for (const entry of tlsEntries) {
        const secretName = entry?.secretName;
        if (!secretName) {
          continue;
        }
        const hosts = Array.isArray(entry?.hosts) ? entry.hosts : [];
        const set = tlsSecrets.get(secretName) ?? new Set<string>();
        for (const host of hosts) {
          if (host) {
            set.add(host);
          }
        }
        tlsSecrets.set(secretName, set);
      }
    }

    if (tlsSecrets.size === 0) {
      return;
    }

    const context = environment.cluster.context;
    const namespace = environment.namespace;
    const keySize = tlsConfig.keySize ?? 2048;
    const validDays = tlsConfig.validDays ?? 365;

    for (const [secretName, hostsSet] of tlsSecrets) {
      const hosts = Array.from(hostsSet);
      const primaryHost = hosts[0] ?? `${service.name}.${environment.name}.local`; // fallback host

      try {
        await execAsync(
          `kubectl --context ${context} --namespace ${namespace} get secret ${secretName}`,
          { cwd: this.cwd },
        );
        continue;
      } catch (error) {
        // Secret not found; proceed to create
        this.logger.info(
          `Auto-generating self-signed TLS secret "${secretName}" for service "${service.name}" in env "${environment.name}"`,
        );
      }

      const certificateHosts = hosts.length > 0 ? hosts : [primaryHost];

      const { cert, key } = await this.generateSelfSignedCertificate(
        certificateHosts,
        keySize,
        validDays,
      );

      const secretManifest = this.buildTlsSecretManifest(
        secretName,
        namespace,
        cert,
        key,
      );

      await this.runCommand(
        `kubectl --context ${context} apply -f -`,
        { input: secretManifest },
      );
    }
  }

  private async generateSelfSignedCertificate(
    hosts: string[],
    keySize: number,
    validDays: number,
  ): Promise<{ cert: Buffer; key: Buffer }> {
    const cn = hosts[0] ?? 'localhost';
    const altNames = hosts.map((host, index) => `DNS.${index + 1} = ${host}`).join('\n');

    const tmpBase = path.join(tmpdir(), 'tsops-tls-');
    const workdir = await fs.mkdtemp(tmpBase);

    const configPath = path.join(workdir, 'openssl.cnf');
    const keyPath = path.join(workdir, 'tls.key');
    const certPath = path.join(workdir, 'tls.crt');

    const configContent = `
[ req ]
default_bits = ${keySize}
prompt = no
default_md = sha256
req_extensions = v3_req
distinguished_name = dn

[ dn ]
CN = ${cn}

[ v3_req ]
subjectAltName = @alt_names

[ alt_names ]
${altNames || `DNS.1 = ${cn}`}
`.trimStart();

    try {
      await fs.writeFile(configPath, configContent, 'utf8');

      await execAsync(
        `openssl req -x509 -nodes -days ${validDays} -newkey rsa:${keySize} -config ${configPath} -extensions v3_req -keyout ${keyPath} -out ${certPath}`,
        { cwd: this.cwd },
      );

      const [cert, key] = await Promise.all([
        fs.readFile(certPath),
        fs.readFile(keyPath),
      ]);

      return { cert, key };
    } finally {
      await fs.rm(workdir, { recursive: true, force: true });
    }
  }

  private buildTlsSecretManifest(
    secretName: string,
    namespace: string,
    cert: Buffer,
    key: Buffer,
  ): string {
    const certBase64 = cert.toString('base64');
    const keyBase64 = key.toString('base64');

    return [
      'apiVersion: v1',
      'kind: Secret',
      'metadata:',
      `  name: ${secretName}`,
      `  namespace: ${namespace}`,
      'type: kubernetes.io/tls',
      'data:',
      `  tls.crt: ${certBase64}`,
      `  tls.key: ${keyBase64}`,
      '',
    ].join('\n');
  }

  private async runHooks(
    hooks: Hook[] | undefined,
    context: Partial<HookContext>,
  ): Promise<void> {
    if (!hooks || hooks.length === 0) {
      return;
    }

    for (const hook of hooks) {
      await hook(context);
    }
  }

  private async notify(
    event: string,
    args: NotificationTemplateArgs,
    template: 'success' | 'failure' = 'success',
  ): Promise<void> {
    const notificationConfig = this.config.notifications;
    if (!notificationConfig) {
      return;
    }

    const channelIds = notificationConfig.onEvents[event];
    if (!channelIds || channelIds.length === 0) {
      return;
    }

    for (const channelId of channelIds) {
      const channelConfig = notificationConfig.channels[channelId];
      if (!channelConfig) {
        this.logger.warn(`No notification channel configured for id "${channelId}"`);
        continue;
      }

      const message =
        template === 'failure'
          ? channelConfig.templates.failure(args)
          : channelConfig.templates.success(args);

      await this.notificationDispatcher({
        event,
        channel: channelId,
        config: channelConfig,
        message,
        args,
      });
    }
  }

  private createKubectlClient(): KubectlClient {
    return {
      apply: async ({ context, namespace, manifests }) => {
        const manifestPayload = serializeManifests(manifests);
        const command = `kubectl --context ${context} --namespace ${namespace} apply -f -`;
        await this.runCommand(command, { input: manifestPayload });
      },
      diff: async ({ context, namespace, manifests }) => {
        const manifestPayload = serializeManifests(manifests);
        const command = `kubectl --context ${context} --namespace ${namespace} diff -f -`;
        await this.runCommand(command, { input: manifestPayload });
      },
      rolloutStatus: async ({ context, namespace, workload, timeoutSeconds }) => {
        const timeout = timeoutSeconds ? ` --timeout=${timeoutSeconds}s` : '';
        const command =
          `kubectl --context ${context} --namespace ${namespace} rollout status ${workload}` +
          timeout;
        await this.runCommand(command);
      },
      exec: async ({ context, namespace, podSelector, container, command }) => {
        const selector = Object.entries(podSelector)
          .map(([key, value]) => `${key}=${value}`)
          .join(',');
        const commandString = quoteArgs(command);
        const fullCommand =
          `kubectl --context ${context} --namespace ${namespace} exec -l ${selector} -c ${container} -- ${commandString}`;
        await this.runCommand(fullCommand);
      },
    };
  }

  private runCommand(
    command: string,
    options: {
      env?: Record<string, string>;
      input?: string;
    } = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, {
        cwd: this.cwd,
        shell: true,
        env: { ...process.env, ...(options.env ?? {}) },
        stdio: options.input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
      });

      if (options.input) {
        child.stdin?.write(options.input);
        child.stdin?.end();
      }

      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${command}`));
        }
      });
    });
  }
}
