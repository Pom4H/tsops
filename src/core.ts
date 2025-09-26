import path from 'node:path'

import type {
  DeployOptions,
  DeployPipelineConfig,
  DeployContext,
  EnvironmentConfig,
  EnvironmentRuntimeInfo,
  ExecFn,
  GitInfo,
  Hook,
  HookContext,
  KubernetesManifest,
  DeploymentManifest,
  KubectlClient,
  NotificationChannelConfig,
  NotificationTemplateArgs,
  ServiceConfig,
  ServiceManifestContext,
  ServiceBuildConfig,
  ServiceRuntime,
  RenderOptions,
  RenderResult,
  RenderedService,
  DeleteOptions,
  RunOptions,
  BuildOptions,
  PushOptions,
  TestOptions,
  TsOpsConfig,
  Logger,
  SecretWriteOptions,
  SecretReadResult,
  SecretDeleteOptions,
  RegistryConfig
} from './types.js'

import { CommandExecutor } from './core/command-executor.js'
import { GitMetadataProvider } from './core/git-metadata.js'

import { createDefaultKubectlClient } from './core/kubectl-client.js'

import { IngressBuilder } from './core/ingress-builder.js'
import { ManifestRenderer } from './core/manifest-renderer.js'

import { IngressControllerInstaller } from './core/ingress-controller-installer.js'
import { SelfSignedTlsManager } from './core/self-signed-tls-manager.js'
import { SecretManager } from './core/secret-manager.js'

export interface NotificationDispatchInput {
  event: string
  channel: string
  config: NotificationChannelConfig
  message: string
  args: NotificationTemplateArgs
}

export type NotificationDispatcher = (input: NotificationDispatchInput) => Promise<void> | void

export interface TsOpsOptions {
  cwd?: string
  exec?: ExecFn
  kubectl?: KubectlClient
  logger?: Logger
  notificationDispatcher?: NotificationDispatcher
}

export type { Logger }

const defaultLogger: Logger = {
  info: (message) => console.log(`[tsops] ${message}`),
  warn: (message) => console.warn(`[tsops] ${message}`),
  error: (message, error) => {
    console.error(`[tsops] ${message}`)
    if (error) {
      console.error(error)
    }
  },
  debug: (message) => {
    if (process.env.TSOPS_DEBUG === '1') {
      console.debug(`[tsops] ${message}`)
    }
  }
}

const defaultNotificationDispatcher: NotificationDispatcher = async ({
  event,
  channel,
  message
}) => {
  defaultLogger.info(`notification:${event} -> ${channel}: ${message}`)
}

export function defineConfig(config: TsOpsConfig): TsOpsConfig {
  return config
}

export class TsOps {
  private readonly config: TsOpsConfig
  private readonly execFn: ExecFn
  private readonly kubectl: KubectlClient
  private readonly logger: Logger
  private readonly notificationDispatcher: NotificationDispatcher
  private readonly cwd: string
  private readonly commandExecutor: CommandExecutor
  private readonly gitMetadataProvider: GitMetadataProvider
  private readonly manifestRenderer: ManifestRenderer
  private readonly ingressBuilder: IngressBuilder
  private readonly ingressControllerInstaller: IngressControllerInstaller
  private readonly selfSignedTlsManager: SelfSignedTlsManager
  private readonly secretManager: SecretManager

  constructor(config: TsOpsConfig, options: TsOpsOptions = {}) {
    this.config = config
    this.cwd = options.cwd ?? process.cwd()
    this.logger = options.logger ?? defaultLogger
    this.commandExecutor = new CommandExecutor(this.cwd)
    this.gitMetadataProvider = new GitMetadataProvider({
      executor: this.commandExecutor,
      logger: this.logger
    })
    this.manifestRenderer = new ManifestRenderer(this.config)
    this.ingressBuilder = new IngressBuilder()
    this.ingressControllerInstaller = new IngressControllerInstaller(
      this.commandExecutor,
      this.logger
    )
    this.selfSignedTlsManager = new SelfSignedTlsManager(this.commandExecutor, this.logger)
    this.secretManager = new SecretManager(this.commandExecutor, this.logger)
    this.notificationDispatcher = options.notificationDispatcher ?? defaultNotificationDispatcher
    this.execFn =
      options.exec ??
      ((command, execOptions) => this.commandExecutor.run(command, { env: execOptions?.env }))
    this.kubectl = options.kubectl ?? this.createKubectlClient()
  }

  async build(serviceName: string, options: BuildOptions = {}): Promise<void> {
    const service = this.resolveService(serviceName)
    const environment = this.resolveEnvironmentForService(service, options.environment)
    const git = options.git ?? (await this.detectGitInfo())

    const envRuntime: EnvironmentRuntimeInfo = {
      name: environment.name,
      namespace: environment.namespace
    }

    const imageTag = this.computeImageTag(service, environment, git)
    const imageRef = `${service.containerImage}:${imageTag}`
    const envVars: Record<string, string> = {
      SERVICE_NAME: service.name,
      ENVIRONMENT: envRuntime.name,
      IMAGE_TAG: imageTag,
      IMAGE_REF: imageRef,
      ...(options.env ?? {})
    }

    await this.runServiceBuild(service, environment, git, imageTag, envVars, options.push)

    const buildPipeline = this.config.pipeline?.build
    if (buildPipeline?.run) {
      this.logger.info(
        `Running build pipeline for service "${service.name}" in env "${envRuntime.name}"`
      )

      await buildPipeline.run({
        exec: this.execFn,
        env: envVars,
        service: this.createServiceRuntime(service),
        environment: envRuntime,
        git
      })
    } else {
      this.logger.info(
        `No custom build pipeline for service "${service.name}"; using automatic Docker build only.`
      )
    }
  }

  async buildAll(environmentName?: string, options: BuildOptions = {}): Promise<void> {
    const order = this.getServiceDeploymentOrder()
    if (order.length === 0) {
      this.logger.warn('No services configured for build; nothing to do.')
      return
    }

    const git = options.git ?? (await this.detectGitInfo())

    for (const serviceName of order) {
      await this.build(serviceName, {
        ...options,
        environment: environmentName ?? options.environment,
        git
      })
    }
  }

  async push(serviceName: string, options: PushOptions = {}): Promise<void> {
    const service = this.resolveService(serviceName)
    const environment = this.resolveEnvironmentForService(service, options.environment)
    const git = options.git ?? (await this.detectGitInfo())

    if (!environment.registry) {
      throw new Error(`No registry configured for environment "${environment.name}"`)
    }

    if (!options.skipBuild) {
      await this.build(serviceName, {
        environment: options.environment,
        env: options.env,
        git,
        push: false // Build locally first
      })
    }

    await this.pushServiceImage(service, environment, git, environment.registry)
  }

  async pushAll(environmentName?: string, options: PushOptions = {}): Promise<void> {
    const order = this.getServiceDeploymentOrder()
    if (order.length === 0) {
      this.logger.warn('No services configured for push; nothing to do.')
      return
    }

    const git = options.git ?? (await this.detectGitInfo())

    for (const serviceName of order) {
      await this.push(serviceName, {
        ...options,
        environment: environmentName ?? options.environment,
        git
      })
    }
  }

  async runAll(environmentName?: string, options: RunOptions = {}): Promise<void> {
    const { env, skipBuild, skipTests, ...deployOptions } = options
    const targetEnvironment = environmentName ?? options.environment
    const git = options.git ?? (await this.detectGitInfo())

    if (!skipBuild) {
      await this.buildAll(targetEnvironment, {
        env,
        git
      })
    }

    if (!skipTests) {
      await this.test({ git })
    }

    await this.deployAll(targetEnvironment, {
      ...deployOptions,
      environment: targetEnvironment,
      git
    })
  }

  async test(options: TestOptions = {}): Promise<void> {
    const git = options.git ?? (await this.detectGitInfo())
    const testPipeline = this.config.pipeline?.test

    if (!testPipeline?.run) {
      this.logger.info('No test pipeline defined; skipping tests.')
      return
    }

    this.logger.info('Running test pipeline')

    await testPipeline.run({
      exec: this.execFn,
      git
    })
  }

  async run(
    serviceName: string,
    environmentName?: string,
    options: RunOptions = {}
  ): Promise<void> {
    const { env, skipBuild, skipTests, ...deployOptions } = options
    const targetEnvironment = environmentName ?? options.environment
    const git = options.git ?? (await this.detectGitInfo())

    if (!skipBuild) {
      await this.build(serviceName, {
        environment: targetEnvironment,
        env,
        git
      })
    }

    if (!skipTests) {
      await this.test({ git })
    }

    await this.deploy(serviceName, targetEnvironment, {
      ...deployOptions,
      environment: targetEnvironment,
      git
    })
  }

  async render(
    serviceName: string,
    environmentName?: string,
    options: RenderOptions = {}
  ): Promise<RenderResult> {
    const service = this.resolveService(serviceName)
    const environment = this.resolveEnvironmentForService(
      service,
      environmentName ?? options.environment
    )
    const git = options.git ?? (await this.detectGitInfo())

    return this.renderManifests(service, environment, git, options.imageTag)
  }

  async renderAll(
    environmentName?: string,
    options: RenderOptions = {}
  ): Promise<RenderedService[]> {
    const order = this.getServiceDeploymentOrder()
    if (order.length === 0) {
      this.logger.warn('No services configured for render; nothing to do.')
      return []
    }

    const git = options.git ?? (await this.detectGitInfo())
    const resolvedEnvironment = environmentName ?? options.environment
    const results: RenderedService[] = []

    for (const serviceName of order) {
      const renderResult = await this.render(serviceName, resolvedEnvironment, {
        ...options,
        environment: resolvedEnvironment,
        git
      })
      results.push({
        service: serviceName,
        ...renderResult
      })
    }

    return results
  }

  async deploy(
    serviceName: string,
    environmentName?: string,
    options: DeployOptions = {}
  ): Promise<void> {
    const service = this.resolveService(serviceName)
    const environment = this.resolveEnvironmentForService(
      service,
      environmentName ?? options.environment
    )
    const git = options.git ?? (await this.detectGitInfo())

    const serviceRuntime = this.createServiceRuntime(service)
    const envRuntime: EnvironmentRuntimeInfo = {
      name: environment.name,
      namespace: environment.namespace
    }

    const manifestsInfo = this.renderManifests(service, environment, git, options.imageTag)

    await this.ensureIngressController(environment)

    await this.selfSignedTlsManager.ensureTlsSecrets(service, environment, manifestsInfo.manifests)

    const hookContext: Partial<HookContext> = {
      exec: this.execFn,
      kubectl: this.kubectl,
      git,
      environment,
      service: serviceRuntime
    }

    if (!options.skipHooks) {
      await this.runHooks(this.config.hooks?.beforeDeploy, hookContext)
    }

    const deployPipeline = this.config.pipeline?.deploy

    if (options.diff || options.diffOnly) {
      await this.runDiff(deployPipeline, environment, manifestsInfo.manifests)
      if (options.diffOnly) {
        return
      }
    }

    try {
      const deployContext: DeployContext = {
        kubectl: this.kubectl,
        environment,
        service: serviceRuntime,
        config: this.config,
        git,
        manifests: manifestsInfo.manifests
      }

      if (deployPipeline?.run) {
        await deployPipeline.run(deployContext)
      } else {
        await this.defaultDeployRun(deployContext)
      }

      if (!options.skipHooks) {
        await this.runHooks(this.config.hooks?.afterDeploy, hookContext)
      }

      if (options.notify ?? true) {
        await this.notify('deploySuccess', {
          service: serviceRuntime,
          environment: envRuntime,
          git
        })
      }

      this.logger.info(
        `Deploy pipeline finished for service "${service.name}" in env "${environment.name}"`
      )
    } catch (error) {
      if (!options.skipHooks) {
        await this.runHooks(this.config.hooks?.onFailure, {
          ...hookContext,
          service: serviceRuntime
        })
      }

      if (options.notify ?? true) {
        await this.notify(
          'deployFailure',
          {
            service: serviceRuntime,
            environment: envRuntime,
            git,
            error
          },
          'failure'
        )
      }

      throw error
    }
  }

  async delete(
    serviceName: string,
    environmentName?: string,
    options: DeleteOptions = {}
  ): Promise<void> {
    const service = this.resolveService(serviceName)
    const environment = this.resolveEnvironmentForService(
      service,
      environmentName ?? options.environment
    )
    const git = options.git ?? (await this.detectGitInfo())

    const manifestsInfo = this.renderManifests(service, environment, git, options.imageTag)

    await this.kubectl.delete({
      context: environment.cluster.context,
      namespace: environment.namespace,
      manifests: manifestsInfo.manifests,
      ignoreNotFound: options.ignoreNotFound,
      gracePeriodSeconds: options.gracePeriodSeconds
    })

    this.logger.info(
      `Deleted resources for service "${service.name}" from env "${environment.name}"`
    )
  }

  async deleteAll(environmentName?: string, options: DeleteOptions = {}): Promise<void> {
    const order = this.getServiceDeploymentOrder()
    if (order.length === 0) {
      this.logger.warn('No services configured for delete; nothing to do.')
      return
    }

    const git = options.git ?? (await this.detectGitInfo())
    const resolvedEnvironment = environmentName ?? options.environment

    for (const serviceName of [...order].reverse()) {
      await this.delete(serviceName, resolvedEnvironment, {
        ...options,
        environment: resolvedEnvironment,
        git
      })
    }
  }

  async deployAll(environmentName?: string, options: DeployOptions = {}): Promise<void> {
    const order = this.getServiceDeploymentOrder()
    if (order.length === 0) {
      this.logger.warn('No services configured for deployment; nothing to do.')
      return
    }

    const git = options.git ?? (await this.detectGitInfo())

    for (const serviceName of order) {
      await this.deploy(serviceName, environmentName ?? options.environment, {
        ...options,
        git
      })
    }
  }

  async getGitInfo(): Promise<GitInfo> {
    return this.detectGitInfo()
  }

  async upsertSecret(
    environmentName: string,
    secretName: string,
    data: Record<string, string>,
    options: SecretWriteOptions = {}
  ): Promise<void> {
    const environment = this.resolveEnvironment(environmentName)

    await this.secretManager.upsertSecret({
      context: environment.cluster.context,
      namespace: environment.namespace,
      name: secretName,
      data,
      options
    })
  }

  async readSecret(environmentName: string, secretName: string): Promise<SecretReadResult> {
    const environment = this.resolveEnvironment(environmentName)

    return this.secretManager.readSecret({
      context: environment.cluster.context,
      namespace: environment.namespace,
      name: secretName
    })
  }

  async deleteSecret(
    environmentName: string,
    secretName: string,
    options: SecretDeleteOptions = {}
  ): Promise<void> {
    const environment = this.resolveEnvironment(environmentName)

    await this.secretManager.deleteSecret({
      context: environment.cluster.context,
      namespace: environment.namespace,
      name: secretName,
      options
    })
  }

  private async runDiff(
    deployConfig: DeployPipelineConfig | undefined,
    environment: EnvironmentConfig & { name: string },
    manifests: KubernetesManifest[]
  ): Promise<void> {
    this.logger.info(
      `Running diff for environment "${environment.name}" (${manifests.length} manifest${
        manifests.length === 1 ? '' : 's'
      })`
    )

    if (deployConfig?.diff) {
      await deployConfig.diff({
        kubectl: this.kubectl,
        environment,
        manifests
      })
      return
    }

    await this.defaultDeployDiff(environment, manifests)
  }

  private resolveEnvironmentForService(
    service: ServiceConfig & { name: string },
    explicitEnvironment?: string
  ): EnvironmentConfig & { name: string } {
    const environmentName =
      explicitEnvironment ?? service.defaultEnvironment ?? this.defaultEnvironment()

    if (!environmentName) {
      throw new Error(
        `Environment not specified for service "${service.name}" and no default found`
      )
    }

    return this.resolveEnvironment(environmentName)
  }

  private defaultEnvironment(): string | undefined {
    const candidate = Object.keys(this.config.environments)
    return candidate.length === 1 ? candidate[0] : undefined
  }

  private resolveService(serviceName: string): ServiceConfig & { name: string } {
    const service = this.config.services[serviceName]
    if (!service) {
      throw new Error(`Unknown service "${serviceName}"`)
    }
    return { ...service, name: serviceName }
  }

  private resolveEnvironment(environmentName: string): EnvironmentConfig & { name: string } {
    const environment = this.config.environments[environmentName]
    if (!environment) {
      throw new Error(`Unknown environment "${environmentName}"`)
    }
    return { ...environment, name: environmentName }
  }

  private createServiceRuntime(service: ServiceConfig & { name: string }): ServiceRuntime {
    return {
      name: service.name,
      releaseName: service.releaseName,
      containerImage: service.containerImage
    }
  }

  private detectGitInfo(): Promise<GitInfo> {
    return this.gitMetadataProvider.getGitInfo()
  }

  private computeImageTag(
    service: ServiceConfig & { name: string },
    environment: EnvironmentConfig & { name: string },
    git: GitInfo
  ): string {
    return this.config.buildImageTag
      ? this.config.buildImageTag(service, environment, git)
      : git.shortSha
  }

  private async runServiceBuild(
    service: ServiceConfig & { name: string },
    environment: EnvironmentConfig & { name: string },
    git: GitInfo,
    imageTag: string,
    envVars: Record<string, string>,
    pushToRegistry = false
  ): Promise<void> {
    const buildConfig = service.build
    if (!buildConfig) {
      return
    }

    // Create a copy of buildConfig with push option
    const buildConfigWithPush = {
      ...buildConfig,
      push: pushToRegistry
    }

    switch (buildConfig.type) {
      case 'dockerfile':
        await this.buildServiceWithDockerfile(service, imageTag, envVars, buildConfigWithPush)
        break
      default: {
        const unknownType = (buildConfig as { type?: string }).type ?? 'unknown'
        this.logger.warn(
          `Skipping automatic build for service "${service.name}"; unsupported build type "${unknownType}".`
        )
      }
    }
  }

  private async buildServiceWithDockerfile(
    service: ServiceConfig & { name: string },
    imageTag: string,
    envVars: Record<string, string>,
    buildConfig: ServiceBuildConfig & { type: 'dockerfile' }
  ): Promise<void> {
    const imageRef = `${service.containerImage}:${imageTag}`
    const contextPath = this.resolvePath(buildConfig.context ?? '.')
    const dockerfilePath = buildConfig.dockerfile
      ? this.resolvePath(buildConfig.dockerfile)
      : undefined

    const commandParts: string[] = ['docker', 'build']

    if (buildConfig.platform) {
      commandParts.push('--platform', buildConfig.platform)
    }
    if (dockerfilePath) {
      commandParts.push('-f', dockerfilePath)
    }
    if (buildConfig.target) {
      commandParts.push('--target', buildConfig.target)
    }

    for (const cacheFrom of buildConfig.cacheFrom ?? []) {
      commandParts.push('--cache-from', cacheFrom)
    }
    for (const cacheTo of buildConfig.cacheTo ?? []) {
      commandParts.push('--cache-to', cacheTo)
    }
    for (const [key, value] of Object.entries(buildConfig.buildArgs ?? {})) {
      commandParts.push('--build-arg', `${key}=${value}`)
    }

    const tagSet = new Set<string>(buildConfig.tags ?? [])
    tagSet.add(imageRef)
    for (const tag of tagSet) {
      commandParts.push('--tag', tag)
    }

    // Add push flag if configured
    if (buildConfig.push) {
      commandParts.push('--push')
    }

    commandParts.push(contextPath)

    const command = commandParts.map((part) => this.shellQuote(part)).join(' ')
    const relativeContext = path.relative(this.cwd, contextPath) || contextPath

    const buildEnv = {
      ...envVars,
      IMAGE_REF: imageRef,
      IMAGE_TAG: imageTag,
      ...(buildConfig.env ?? {})
    }

    this.logger.info(
      `Building Docker image ${imageRef} for service "${service.name}" (context: ${relativeContext})${buildConfig.push ? ' and pushing to registry' : ''}`
    )

    await this.execFn(command, { env: buildEnv })
  }

  private async pushServiceImage(
    service: ServiceConfig & { name: string },
    environment: EnvironmentConfig & { name: string },
    git: GitInfo,
    registry: RegistryConfig
  ): Promise<void> {
    const imageTag = this.computeImageTag(service, environment, git)
    const localImageRef = `${service.containerImage}:${imageTag}`

    // Extract image name without registry URL if it's already included
    const imageName = service.containerImage.startsWith(registry.url + '/')
      ? service.containerImage.substring(registry.url.length + 1)
      : service.containerImage

    const registryImageRef = `${registry.url}/${imageName}:${imageTag}`
    const latestImageRef = `${registry.url}/${imageName}:latest`

    // Login to registry if credentials are provided
    if (registry.username && registry.password) {
      await this.loginToRegistry(registry)
    }

    // Tag the local image for registry
    await this.execFn(
      `docker tag ${this.shellQuote(localImageRef)} ${this.shellQuote(registryImageRef)}`
    )
    await this.execFn(
      `docker tag ${this.shellQuote(localImageRef)} ${this.shellQuote(latestImageRef)}`
    )

    // Push images to registry
    this.logger.info(`Pushing image ${registryImageRef} to registry`)
    await this.execFn(`docker push ${this.shellQuote(registryImageRef)}`)

    this.logger.info(`Pushing image ${latestImageRef} to registry`)
    await this.execFn(`docker push ${this.shellQuote(latestImageRef)}`)

    this.logger.info(`Successfully pushed images for service "${service.name}" to registry`)
  }

  private async loginToRegistry(registry: RegistryConfig): Promise<void> {
    const loginCommand = `echo "${registry.password}" | docker login ${registry.insecure ? '--insecure-registry' : ''} ${registry.url} --username ${this.shellQuote(registry.username!)} --password-stdin`

    this.logger.info(`Logging in to registry ${registry.url}`)
    await this.execFn(loginCommand)
  }

  private async defaultDeployRun(ctx: DeployContext): Promise<void> {
    await ctx.kubectl.apply({
      context: ctx.environment.cluster.context,
      namespace: ctx.environment.namespace,
      manifests: ctx.manifests
    })

    for (const manifest of ctx.manifests) {
      if (manifest.kind === 'Deployment') {
        const deployment = manifest as DeploymentManifest
        const name = deployment.metadata?.name
        if (!name) {
          continue
        }

        await ctx.kubectl.rolloutStatus({
          context: ctx.environment.cluster.context,
          namespace: ctx.environment.namespace,
          workload: `deployment/${name}`,
          timeoutSeconds: 120
        })
      }
    }
  }

  private async defaultDeployDiff(
    environment: EnvironmentConfig & { name: string },
    manifests: KubernetesManifest[]
  ): Promise<void> {
    await this.kubectl.diff({
      context: environment.cluster.context,
      namespace: environment.namespace,
      manifests
    })
  }

  private resolvePath(input: string): string {
    return path.isAbsolute(input) ? input : path.join(this.cwd, input)
  }

  private shellQuote(value: string): string {
    if (value === '') {
      return "''"
    }
    if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
      return value
    }
    return `'${value.replace(/'/g, "'\\''")}'`
  }

  private renderManifests(
    service: ServiceConfig & { name: string },
    environment: EnvironmentConfig & { name: string },
    git: GitInfo,
    explicitImageTag?: string
  ): { manifests: KubernetesManifest[]; imageTag: string; context: ServiceManifestContext } {
    const renderResult = this.manifestRenderer.render({
      service,
      environment,
      git,
      explicitImageTag
    })

    const manifestsWithIngress = this.ingressBuilder.appendIngressManifests(
      renderResult.manifests,
      service,
      environment
    )

    return {
      manifests: manifestsWithIngress,
      imageTag: renderResult.imageTag,
      context: renderResult.context
    }
  }

  private getServiceDeploymentOrder(): string[] {
    const services = Object.keys(this.config.services)
    const visited = new Set<string>()
    const visiting = new Set<string>()
    const order: string[] = []

    const visit = (serviceName: string): void => {
      if (visited.has(serviceName)) {
        return
      }
      if (visiting.has(serviceName)) {
        throw new Error(`Circular dependency detected for service "${serviceName}"`)
      }

      const service = this.config.services[serviceName]
      if (!service) {
        throw new Error(`Unknown service "${serviceName}" while computing deployment order`)
      }

      visiting.add(serviceName)

      for (const dependency of service.dependsOn ?? []) {
        if (!this.config.services[dependency]) {
          throw new Error(`Service "${serviceName}" depends on unknown service "${dependency}"`)
        }
        visit(dependency)
      }

      visiting.delete(serviceName)
      visited.add(serviceName)
      order.push(serviceName)
    }

    for (const serviceName of services) {
      visit(serviceName)
    }

    return order
  }

  private async ensureIngressController(
    environment: EnvironmentConfig & { name: string }
  ): Promise<void> {
    await this.ingressControllerInstaller.ensure(environment)
  }

  private async runHooks(hooks: Hook[] | undefined, context: Partial<HookContext>): Promise<void> {
    if (!hooks || hooks.length === 0) {
      return
    }

    for (const hook of hooks) {
      await hook(context)
    }
  }

  private async notify(
    event: string,
    args: NotificationTemplateArgs,
    template: 'success' | 'failure' = 'success'
  ): Promise<void> {
    const notificationConfig = this.config.notifications
    if (!notificationConfig) {
      return
    }

    const channelIds = notificationConfig.onEvents[event]
    if (!channelIds || channelIds.length === 0) {
      return
    }

    for (const channelId of channelIds) {
      const channelConfig = notificationConfig.channels[channelId]
      if (!channelConfig) {
        this.logger.warn(`No notification channel configured for id "${channelId}"`)
        continue
      }

      const message =
        template === 'failure'
          ? channelConfig.templates.failure(args)
          : channelConfig.templates.success(args)

      await this.notificationDispatcher({
        event,
        channel: channelId,
        config: channelConfig,
        message,
        args
      })
    }
  }

  private createKubectlClient(): KubectlClient {
    return createDefaultKubectlClient(this.commandExecutor)
  }
}
