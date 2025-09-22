import {
  DeployPipelineConfig,
  EnvironmentConfig,
  EnvironmentRuntimeInfo,
  ExecFn,
  GitInfo,
  Hook,
  HookContext,
  KubernetesManifest,
  KubectlClient,
  NotificationChannelConfig,
  NotificationTemplateArgs,
  ServiceConfig,
  ServiceManifestContext,
  ServiceRuntime,
  TsOpsConfig,
  Logger
} from './types';

import { CommandExecutor } from './core/command-executor';
import { GitMetadataProvider } from './core/git-metadata';

import { createDefaultKubectlClient } from './core/kubectl-client';

import { IngressBuilder } from './core/ingress-builder';
import { ManifestRenderer } from './core/manifest-renderer';

import { IngressControllerInstaller } from './core/ingress-controller-installer';
import { SelfSignedTlsManager } from './core/self-signed-tls-manager';


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

export type { Logger };

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

export class TsOps {
  private readonly config: TsOpsConfig;
  private readonly execFn: ExecFn;
  private readonly kubectl: KubectlClient;
  private readonly logger: Logger;
  private readonly notificationDispatcher: NotificationDispatcher;
  private readonly cwd: string;
  private readonly commandExecutor: CommandExecutor;
  private readonly gitMetadataProvider: GitMetadataProvider;
  private readonly manifestRenderer: ManifestRenderer;
  private readonly ingressBuilder: IngressBuilder;
  private readonly ingressControllerInstaller: IngressControllerInstaller;
  private readonly selfSignedTlsManager: SelfSignedTlsManager;

  constructor(config: TsOpsConfig, options: TsOpsOptions = {}) {
    this.config = config;
    this.cwd = options.cwd ?? process.cwd();
    this.logger = options.logger ?? defaultLogger;
    this.commandExecutor = new CommandExecutor(this.cwd);
    this.gitMetadataProvider = new GitMetadataProvider({
      executor: this.commandExecutor,
      logger: this.logger,
    });
    this.manifestRenderer = new ManifestRenderer(this.config);
    this.ingressBuilder = new IngressBuilder();
    this.ingressControllerInstaller = new IngressControllerInstaller(
      this.commandExecutor,
      this.logger,
    );
    this.selfSignedTlsManager = new SelfSignedTlsManager(
      this.commandExecutor,
      this.logger,
    );
    this.notificationDispatcher =
      options.notificationDispatcher ?? defaultNotificationDispatcher;
    this.execFn =
      options.exec ?? ((command, execOptions) =>
        this.commandExecutor.run(command, { env: execOptions?.env }));
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

    await this.selfSignedTlsManager.ensureTlsSecrets(
      service,
      environment,
      manifestsInfo.manifests,
    );

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

  private detectGitInfo(): Promise<GitInfo> {
    return this.gitMetadataProvider.getGitInfo();
  }

  private renderManifests(
    service: ServiceConfig & { name: string },
    environment: EnvironmentConfig & { name: string },
    git: GitInfo,
    explicitImageTag?: string,
  ): { manifests: KubernetesManifest[]; imageTag: string; context: ServiceManifestContext } {
    const renderResult = this.manifestRenderer.render({
      service,
      environment,
      git,
      explicitImageTag,
    });

    const manifestsWithIngress = this.ingressBuilder.appendIngressManifests(
      renderResult.manifests,
      service,
      environment,
    );

    return {
      manifests: manifestsWithIngress,
      imageTag: renderResult.imageTag,
      context: renderResult.context,
    };
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
    await this.ingressControllerInstaller.ensure(environment);
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
    return createDefaultKubectlClient(this.commandExecutor);
  }

}
