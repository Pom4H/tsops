import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TsOps } from '../src/core';
import type {
  DeploymentManifest,
  ExecFn,
  GitInfo,
  IngressManifest,
  KubectlClient,
  ServiceManifest,
  ServiceManifestContext,
  TsOpsConfig,
} from '../types';

const gitInfo: GitInfo = {
  branch: 'main',
  sha: 'abcdef1234567890',
  shortSha: 'abcdef1',
  tag: undefined,
  hasUncommittedChanges: false,
};

describe('TsOps', () => {
  let buildRun: ReturnType<typeof vi.fn>;
  let testRun: ReturnType<typeof vi.fn>;
  let deployRun: ReturnType<typeof vi.fn>;
  let deployDiff: ReturnType<typeof vi.fn>;
  let config: TsOpsConfig;
  let exec: ExecFn;
  let kubectl: KubectlClient;
  let notificationDispatcher: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    buildRun = vi.fn(async () => {});
    testRun = vi.fn(async () => {});
    deployRun = vi.fn(async () => {});
    deployDiff = vi.fn(async () => {});

    config = {
      project: {
        name: 'test-project',
        repoUrl: 'git@example.com:test.git',
        defaultBranch: 'main',
      },
      environments: {
        dev: {
          cluster: { apiServer: 'https://k8s.dev.example.com', context: 'dev' },
          namespace: 'test-dev',
          imageTagStrategy: { type: 'gitSha', length: 7 },
        },
      },
      services: {
        api: {
          containerImage: 'gcr.io/example/api',
          defaultEnvironment: 'dev',
          manifests: () => [{ kind: 'ConfigMap', metadata: { name: 'api' } }],
        },
      },
      pipeline: {
        build: {
          run: buildRun,
        },
        test: {
          run: testRun,
        },
        deploy: {
          run: deployRun,
          diff: deployDiff,
        },
      },
      secrets: {
        provider: { type: 'vault', connection: {} },
        map: {},
      },
      notifications: {
        channels: {
          slack: {
            webhookSecret: 'SLACK_WEBHOOK',
            channel: '#deployments',
            templates: {
              success: ({ service, environment, git }) =>
                `success:${service.name}:${environment.name}:${git.shortSha}`,
              failure: ({ service, environment, error }) =>
                `failure:${service.name}:${environment.name}:${String(error)}`,
            },
          },
        },
        onEvents: {
          deploySuccess: ['slack'],
          deployFailure: ['slack'],
        },
      },
    };

    exec = vi.fn(async () => {});
    kubectl = {
      apply: vi.fn(async () => {}),
      diff: vi.fn(async () => {}),
      rolloutStatus: vi.fn(async () => {}),
      exec: vi.fn(async () => {}),
    };
    notificationDispatcher = vi.fn(async () => {});
  });

  const createTsOps = () =>
    new TsOps(config, {
      exec,
      kubectl,
      notificationDispatcher,
    });

  it('runs the build pipeline with derived environment variables', async () => {
    const tsops = createTsOps();

    await tsops.build('api', { git: gitInfo, env: { EXTRA: '1' } });

    expect(buildRun).toHaveBeenCalledTimes(1);
    const call = buildRun.mock.calls[0][0];
    expect(call.env).toMatchObject({
      SERVICE_NAME: 'api',
      ENVIRONMENT: 'dev',
      EXTRA: '1',
    });
    expect(call.service.name).toBe('api');
    expect(call.environment.name).toBe('dev');
  });

  it('buildAll runs builds for all services respecting dependencies', async () => {
    config.services = {
      api: {
        containerImage: 'gcr.io/example/api',
        defaultEnvironment: 'dev',
        manifests: () => [{ kind: 'ConfigMap', metadata: { name: 'api' } }],
      },
      worker: {
        containerImage: 'gcr.io/example/worker',
        defaultEnvironment: 'dev',
        dependsOn: ['api'],
        manifests: () => [{ kind: 'ConfigMap', metadata: { name: 'worker' } }],
      },
    };

    const order: string[] = [];
    buildRun.mockImplementation(async ({ service }) => {
      order.push(service.name);
    });

    const tsops = createTsOps();
    await tsops.buildAll('dev', { git: gitInfo });

    expect(buildRun).toHaveBeenCalledTimes(2);
    expect(order).toEqual(['api', 'worker']);
  });

  it('runs diff and skips deployment when diffOnly is set', async () => {
    const tsops = createTsOps();

    await tsops.deploy('api', undefined, {
      git: gitInfo,
      diff: true,
      diffOnly: true,
      notify: false,
    });

    expect(deployDiff).toHaveBeenCalledTimes(1);
    expect(deployRun).not.toHaveBeenCalled();
  });

  it('dispatches notifications after a successful deploy', async () => {
    const tsops = createTsOps();

    await tsops.deploy('api', undefined, { git: gitInfo });

    expect(deployRun).toHaveBeenCalledTimes(1);
    expect(notificationDispatcher).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'deploySuccess', channel: 'slack' }),
    );
  });

  it('invokes failure hooks and notifications when deploy fails', async () => {
    config.hooks = {
      onFailure: [vi.fn(async () => {})],
    };
    const failingError = new Error('deploy failed');
    deployRun.mockRejectedValueOnce(failingError);
    const tsops = createTsOps();

    await expect(tsops.deploy('api', undefined, { git: gitInfo })).rejects.toThrow(
      'deploy failed',
    );

    expect(config.hooks?.onFailure?.[0]).toHaveBeenCalledTimes(1);
    expect(notificationDispatcher).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'deployFailure', channel: 'slack' }),
    );
  });

  it('deployAll deploys services respecting dependency order', async () => {
    config.services = {
      api: {
        containerImage: 'gcr.io/example/api',
        defaultEnvironment: 'dev',
        manifests: () => [{ kind: 'ConfigMap', metadata: { name: 'api' } }],
      },
      worker: {
        containerImage: 'gcr.io/example/worker',
        defaultEnvironment: 'dev',
        dependsOn: ['api'],
        manifests: () => [{ kind: 'ConfigMap', metadata: { name: 'worker' } }],
      },
    };

    const deployOrder: string[] = [];
    deployRun.mockImplementation(async ({ service }) => {
      deployOrder.push(service.name);
    });

    const tsops = createTsOps();
    await tsops.deployAll('dev', { git: gitInfo, notify: false });

    expect(deployRun).toHaveBeenCalledTimes(2);
    expect(deployOrder).toEqual(['api', 'worker']);
  });
});

describe('TsOps end-to-end deployment', () => {
  it('builds Docker images and deploys frontend and backend apps to docker-desktop', async () => {
    const dockerfileMap: Record<'frontend' | 'backend', { dockerfile: string; context: string }> = {
      frontend: { dockerfile: './apps/frontend/Dockerfile', context: './apps/frontend' },
      backend: { dockerfile: './apps/backend/Dockerfile', context: './apps/backend' },
    };

    const createManifests = (
      name: 'frontend' | 'backend',
      ports: { container: number; service: number },
    ) =>
      (
        context: ServiceManifestContext,
      ): [DeploymentManifest, ServiceManifest] => {
        const deployment: DeploymentManifest = {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: {
            name,
            namespace: context.env.namespace,
            labels: { app: name, tier: context.env.name },
          },
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: name } },
            template: {
              metadata: {
                labels: { app: name, tier: context.env.name },
              },
              spec: {
                containers: [
                  {
                    name,
                    image: context.image,
                    ports: [{ containerPort: ports.container }],
                  },
                ],
              },
            },
          },
        };

        const service: ServiceManifest = {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: {
            name,
            namespace: context.env.namespace,
            labels: { app: name },
          },
          spec: {
            selector: { app: name },
            ports: [
              {
                port: ports.service,
                targetPort: ports.container,
              },
            ],
          },
        };

        return [deployment, service];
      };

    const services: TsOpsConfig['services'] = {
      frontend: {
        containerImage: 'docker.io/company/frontend',
        defaultEnvironment: 'local',
        manifests: createManifests('frontend', { container: 3000, service: 80 }),
        ingress: {
          websecure: {
            name: 'frontend',
            className: 'traefik',
            entryPoints: ['websecure'],
            rules: [
              {
                host: 'frontend.local.tsops',
                paths: [
                  {
                    path: '/',
                    servicePort: 80,
                  },
                ],
              },
            ],
            tls: [
              {
                secretName: 'frontend-tls',
                hosts: ['frontend.local.tsops'],
              },
            ],
          },
        },
      },
      backend: {
        containerImage: 'docker.io/company/backend',
        defaultEnvironment: 'local',
        manifests: createManifests('backend', { container: 8080, service: 8080 }),
        ingress: {
          websecure: {
            name: 'backend',
            className: 'traefik',
            entryPoints: ['websecure'],
            rules: [
              {
                host: 'backend.local.tsops',
                paths: [
                  {
                    path: '/',
                    servicePort: 8080,
                  },
                ],
              },
            ],
            tls: [
              {
                secretName: 'backend-tls',
                hosts: ['backend.local.tsops'],
              },
            ],
          },
        },
      },
    };

    const config: TsOpsConfig = {
      project: {
        name: 'docker-desktop-demo',
        repoUrl: 'git@example.com:demo/docker-desktop-demo.git',
        defaultBranch: 'main',
      },
      environments: {
        local: {
          cluster: {
            apiServer: 'https://kubernetes.docker.internal',
            context: 'docker-desktop',
          },
          namespace: 'demo-apps',
          imageTagStrategy: { type: 'gitSha', length: 7 },
        },
      },
      services,
      pipeline: {
        build: {
          run: async ({ exec, env, service, git }) => {
            const key = service.name as keyof typeof dockerfileMap;
            const target = dockerfileMap[key];
            await exec(
              `docker build -f ${target.dockerfile} -t ${service.containerImage}:${git.shortSha} ${target.context}`,
              { env },
            );
          },
        },
        test: {
          run: async () => {},
        },
        deploy: {
          run: async ({ kubectl, environment, service, manifests }) => {
            await kubectl.apply({
              context: environment.cluster.context,
              namespace: environment.namespace,
              manifests,
            });

            await kubectl.rolloutStatus({
              context: environment.cluster.context,
              namespace: environment.namespace,
              workload: `deployment/${service.name}`,
            });
          },
        },
      },
      secrets: {
        provider: { type: 'vault', connection: {} },
        map: {},
      },
      notifications: {
        channels: {
          slack: {
            webhookSecret: 'SLACK_WEBHOOK',
            channel: '#deployments',
            templates: {
              success: ({ service, environment, git }) =>
                `${service.name} deployed to ${environment.name} @ ${git.shortSha}`,
              failure: ({ service, environment, error }) =>
                `${service.name} failed in ${environment.name}: ${String(error)}`,
            },
          },
        },
        onEvents: {
          deploySuccess: ['slack'],
          deployFailure: ['slack'],
        },
      },
    };

    const exec = vi.fn(async () => {});
    const kubectlApply = vi.fn(async () => {});
    const kubectlDiff = vi.fn(async () => {});
    const kubectlRolloutStatus = vi.fn(async () => {});
    const kubectlExec = vi.fn(async () => {});

    const tsops = new TsOps(config, {
      exec,
      kubectl: {
        apply: kubectlApply,
        diff: kubectlDiff,
        rolloutStatus: kubectlRolloutStatus,
        exec: kubectlExec,
      },
    });

    await tsops.build('frontend', { git: gitInfo });
    await tsops.deploy('frontend', 'local', { git: gitInfo, notify: false });
    await tsops.build('backend', { git: gitInfo });
    await tsops.deploy('backend', 'local', { git: gitInfo, notify: false });

    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec.mock.calls[0][0]).toBe(
      'docker build -f ./apps/frontend/Dockerfile -t docker.io/company/frontend:abcdef1 ./apps/frontend',
    );
    expect(exec.mock.calls[1][0]).toBe(
      'docker build -f ./apps/backend/Dockerfile -t docker.io/company/backend:abcdef1 ./apps/backend',
    );

    expect(kubectlApply).toHaveBeenCalledTimes(2);
    const frontendApply = kubectlApply.mock.calls[0][0];
    expect(frontendApply.context).toBe('docker-desktop');
    expect(frontendApply.namespace).toBe('demo-apps');
    const frontendDeployment = (frontendApply.manifests.find(
      (manifest) => (manifest as DeploymentManifest).kind === 'Deployment',
    ) as DeploymentManifest | undefined);
    expect(frontendDeployment?.metadata.name).toBe('frontend');
    expect(frontendDeployment?.spec.template.spec.containers[0]?.image).toBe(
      'docker.io/company/frontend:abcdef1',
    );
    const frontendIngress = frontendApply.manifests.find(
      (manifest) => (manifest as IngressManifest).kind === 'Ingress',
    ) as IngressManifest | undefined;
    expect(frontendIngress?.spec?.tls?.[0]?.secretName).toBe('frontend-tls');
    expect(
      frontendIngress?.metadata?.annotations?.[
        'traefik.ingress.kubernetes.io/router.entrypoints'
      ],
    ).toBe('websecure');
    expect(
      frontendIngress?.metadata?.annotations?.[
        'traefik.ingress.kubernetes.io/router.tls'
      ],
    ).toBe('true');

    const backendApply = kubectlApply.mock.calls[1][0];
    expect(backendApply.context).toBe('docker-desktop');
    expect(backendApply.namespace).toBe('demo-apps');
    const backendDeployment = (backendApply.manifests.find(
      (manifest) => (manifest as DeploymentManifest).kind === 'Deployment',
    ) as DeploymentManifest | undefined);
    expect(backendDeployment?.metadata.name).toBe('backend');
    expect(backendDeployment?.spec.template.spec.containers[0]?.image).toBe(
      'docker.io/company/backend:abcdef1',
    );
    const backendIngress = backendApply.manifests.find(
      (manifest) => (manifest as IngressManifest).kind === 'Ingress',
    ) as IngressManifest | undefined;
    expect(backendIngress?.spec?.tls?.[0]?.secretName).toBe('backend-tls');
    expect(
      backendIngress?.metadata?.annotations?.[
        'traefik.ingress.kubernetes.io/router.entrypoints'
      ],
    ).toBe('websecure');
    expect(
      backendIngress?.metadata?.annotations?.[
        'traefik.ingress.kubernetes.io/router.tls'
      ],
    ).toBe('true');

    expect(kubectlRolloutStatus).toHaveBeenCalledTimes(2);
    expect(kubectlRolloutStatus.mock.calls[0][0]).toMatchObject({
      context: 'docker-desktop',
      namespace: 'demo-apps',
      workload: 'deployment/frontend',
    });
    expect(kubectlRolloutStatus.mock.calls[1][0]).toMatchObject({
      context: 'docker-desktop',
      namespace: 'demo-apps',
      workload: 'deployment/backend',
    });

    expect(kubectlDiff).not.toHaveBeenCalled();
    expect(kubectlExec).not.toHaveBeenCalled();
  });
});
