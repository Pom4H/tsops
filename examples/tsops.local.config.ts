import type {
  DeploymentManifest,
  KubernetesManifest,
  ServiceManifest,
  ServiceManifestContext,
  TsOpsConfig,
} from '../dist/types';

const dockerfileMap: Record<
  'frontend' | 'backend',
  { dockerfile: string; context: string }
> = {
  frontend: {
    dockerfile: './apps/frontend/Dockerfile',
    context: './apps/frontend',
  },
  backend: {
    dockerfile: './apps/backend/Dockerfile',
    context: './apps/backend',
  },
};

const createManifests = (
  name: 'frontend' | 'backend',
  ports: { container: number; service: number }
): ((ctx: ServiceManifestContext) => KubernetesManifest[]) => {
  return (context) => {
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
                imagePullPolicy: 'IfNotPresent',
                ports: [{ containerPort: ports.container }],
                env: [
                  {
                    name: 'PORT',
                    value: String(ports.container),
                  },
                ],
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
            name: 'http',
            port: ports.service,
            targetPort: ports.container,
            protocol: 'TCP',
          },
        ],
      },
    };

    return [deployment, service];
  };
};

const services: TsOpsConfig['services'] = {
  frontend: {
    containerImage: 'frontend',
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
    containerImage: 'backend',
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
      ingressController: {
        type: 'traefik',
        autoInstall: true,
        namespace: 'kube-system',
        serviceType: 'NodePort',
      },
      tls: {
        selfSigned: {
          enabled: true,
        },
      },
    },
  },
  services,
  pipeline: {
    build: {
      run: async ({ exec, service, git }) => {
        const key = service.name as keyof typeof dockerfileMap;
        const { dockerfile, context } = dockerfileMap[key];
        const tag = `${service.containerImage}:${git.shortSha}`;

        await exec(`docker build -f ${dockerfile} -t ${tag} ${context}`);
      },
    },
    test: {
      run: async () => {
        // No-op for local demo
      },
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

export default config;
