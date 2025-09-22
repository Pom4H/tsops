import {
  DeploymentManifest,
  IngressManifest,
  KubernetesManifest,
  ServiceManifest,
  ServiceManifestContext,
  TsOpsConfig,
  EnvironmentConfig,
  ServiceConfig,
  GitInfo,
} from './types';

const buildImageTag = (
  service: ServiceConfig & { name: string },
  environment: EnvironmentConfig & { name: string },
  git: GitInfo,
): string => {
  const strategy = environment.imageTagStrategy;

  switch (strategy.type) {
    case 'branchName':
      return git.branch.replace(/[^a-zA-Z0-9-_]/g, '-');
    case 'gitSha':
      return git.sha.slice(0, strategy.length ?? 7);
    case 'semver':
      return `${strategy.prefix ?? ''}${git.tag ?? git.sha.slice(0, 7)}`;
    default:
      return git.shortSha;
  }
};

const applyEnvOverrideManifests = (
  service: ServiceConfig & { name: string },
  context: ServiceManifestContext,
): KubernetesManifest[] => {
  const override = service.envOverrides?.[context.env.name]?.manifests;
  return override ? override(context) : service.manifests(context);
};

const renderManifests = (
  input: {
    environment: EnvironmentConfig & { name: string };
    service: ServiceConfig & { name: string };
    imageTag: string;
  },
): KubernetesManifest[] => {
  const image = `${input.service.containerImage}:${input.imageTag}`;
  const context: ServiceManifestContext = {
    env: {
      name: input.environment.name,
      namespace: input.environment.namespace,
    },
    image,
  };

  return applyEnvOverrideManifests(input.service, context);
};

const apiManifests = ({ env, image }: ServiceManifestContext): KubernetesManifest[] => {
  const deployment: DeploymentManifest = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'api',
      namespace: env.namespace,
      labels: { app: 'api', tier: env.name },
      annotations: {
        'deploy.tsops.dev/policy': 'managed',
      },
    },
    spec: {
      replicas: env.name === 'prod' ? 6 : 2,
      selector: { matchLabels: { app: 'api' } },
      template: {
        metadata: {
          labels: { app: 'api', tier: env.name },
          annotations: {
            'prometheus.io/scrape': 'true',
            'prometheus.io/port': '8080',
          },
        },
        spec: {
          containers: [
            {
              name: 'api',
              image,
              ports: [{ name: 'http', containerPort: 8080 }],
              readinessProbe: {
                httpGet: { path: '/healthz', port: 8080 },
                initialDelaySeconds: 10,
                periodSeconds: 5,
              },
              resources: {
                requests: { cpu: '250m', memory: '256Mi' },
                limits: { cpu: '1', memory: '512Mi' },
              },
              env: [
                { name: 'NODE_ENV', value: env.name },
                {
                  name: 'DATABASE_URL',
                  valueFrom: {
                    secretKeyRef: { name: 'api-secrets', key: 'dbUrl' },
                  },
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
      name: 'api',
      namespace: env.namespace,
      labels: { app: 'api', tier: env.name },
    },
    spec: {
      selector: { app: 'api' },
      ports: [
        {
          name: 'http',
          port: 80,
          targetPort: 8080,
          protocol: 'TCP',
        },
      ],
      type: 'ClusterIP',
    },
  };

  const ingress: IngressManifest = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: 'api',
      namespace: env.namespace,
      annotations: {
        'nginx.ingress.kubernetes.io/rewrite-target': '/',
      },
    },
    spec: {
      ingressClassName: 'nginx',
      rules: [
        {
          host: env.name === 'prod' ? 'api.example.com' : `api-${env.name}.example.com`,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: { name: 'api', port: { name: 'http' } },
                },
              },
            ],
          },
        },
      ],
    },
  };

  return [deployment, service, ingress];
};

const workerManifests = ({ env, image }: ServiceManifestContext): KubernetesManifest[] => {
  const deployment: DeploymentManifest = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'worker',
      namespace: env.namespace,
      labels: { app: 'worker', tier: env.name },
    },
    spec: {
      replicas: env.name === 'prod' ? 5 : 1,
      selector: { matchLabels: { app: 'worker' } },
      template: {
        metadata: {
          labels: { app: 'worker', tier: env.name },
        },
        spec: {
          containers: [
            {
              name: 'worker',
              image,
              args: ['node', 'dist/worker.js'],
              env: [
                {
                  name: 'QUEUE_URL',
                  valueFrom: {
                    secretKeyRef: { name: 'worker-secrets', key: 'queueUrl' },
                  },
                },
              ],
            },
          ],
        },
      },
    },
  };

  return [deployment];
};

const config: TsOpsConfig = {
  project: {
    name: 'awesome-platform',
    repoUrl: 'git@github.com:org/awesome-platform.git',
    defaultBranch: 'main',
  },
  environments: {
    dev: {
      cluster: { apiServer: 'https://gke.dev.example.com', context: 'gke_dev' },
      namespace: 'awesome-dev',
      imageTagStrategy: { type: 'branchName' },
      kubectlOptions: { dryRun: false },
    },
    staging: {
      cluster: { apiServer: 'https://gke.stg.example.com', context: 'gke_stg' },
      namespace: 'awesome-staging',
      imageTagStrategy: { type: 'gitSha', length: 12 },
      requiresApproval: false,
    },
    prod: {
      cluster: { apiServer: 'https://gke.prod.example.com', context: 'gke_prod' },
      namespace: 'awesome-prod',
      imageTagStrategy: { type: 'semver', prefix: 'release-' },
      requiresApproval: true,
      maintenanceWindow: { day: 'sat', startUtc: '02:00', endUtc: '04:00' },
    },
  },
  services: {
    api: {
      containerImage: 'gcr.io/org/api',
      releaseName: 'api',
      defaultEnvironment: 'staging',
      rollout: { strategy: 'rolling', maxUnavailable: 1, maxSurge: 1 },
      manifests: apiManifests,
      envOverrides: {
        prod: {
          manifests: ({ env, image }) => {
            const base = apiManifests({ env, image });
            const deployment = base[0] as DeploymentManifest;
            if (deployment.spec.template.spec.containers[0]) {
              deployment.spec.template.spec.containers[0].resources = {
                requests: { cpu: '500m', memory: '512Mi' },
                limits: { cpu: '2', memory: '1Gi' },
              };
            }
            deployment.spec.replicas = 6;
            return base;
          },
        },
      },
    },
    worker: {
      containerImage: 'gcr.io/org/worker',
      releaseName: 'worker',
      dependsOn: ['api'],
      manifests: workerManifests,
    },
  },
  pipeline: {
    build: {
      run: async ({ exec, env }) => {
        await exec('pnpm install', { env });
        await exec('pnpm run build', {
          env: { ...env, NODE_ENV: 'production' },
        });
      },
      artifacts: [
        {
          source: 'dist',
          include: ['**/*.js', '**/*.map'],
        },
      ],
      publishImage: {
        registry: 'gcr.io/org',
        tagTemplate: ({ service, environment, git }) =>
          `${service.name}:${git.shortSha}-${environment.name}`,
      },
    },
    test: {
      run: async ({ exec }) => {
        await exec('pnpm run lint');
        await exec('pnpm run test -- --runInBand');
      },
      coverageThreshold: 0.85,
    },
    deploy: {
      defaultStrategy: { type: 'rolling', maxUnavailable: 1, maxSurge: 1 },
      strategies: {
        canary: { type: 'canary', steps: [10, 30, 60, 100], pauseSeconds: 120 },
      },
      run: async ({ kubectl, environment, service, config, git }) => {
        const envConfig = { ...environment, name: environment.name };
        const serviceConfig = {
          ...config.services[service.name],
          name: service.name,
        };
        const imageTag = config.buildImageTag
          ? config.buildImageTag(serviceConfig, envConfig, git)
          : git.shortSha;
        const manifests = config.renderManifests
          ? config.renderManifests({
              environment: envConfig,
              service: serviceConfig,
              imageTag,
            })
          : applyEnvOverrideManifests(serviceConfig, {
              env: { name: envConfig.name, namespace: envConfig.namespace },
              image: `${serviceConfig.containerImage}:${imageTag}`,
            });

        await kubectl.apply({
          context: environment.cluster.context,
          namespace: environment.namespace,
          manifests,
        });

        if (serviceConfig.rollout?.strategy === 'rolling') {
          await kubectl.rolloutStatus({
            context: environment.cluster.context,
            namespace: environment.namespace,
            workload: `deployment/${service.name}`,
            timeoutSeconds: 300,
          });
        }
      },
      diff: async ({ kubectl, environment, manifests }) => {
        await kubectl.diff({
          context: environment.cluster.context,
          namespace: environment.namespace,
          manifests,
        });
      },
    },
  },
  secrets: {
    provider: {
      type: 'vault',
      connection: {
        address: 'https://vault.internal',
        roleId: 'role-api',
      },
    },
    map: {
      API_DB_URL: { path: 'kv/data/api', key: 'dbUrl' },
      QUEUE_URL: { path: 'kv/data/worker', key: 'queueUrl' },
    },
  },
  notifications: {
    channels: {
      slack: {
        webhookSecret: 'SLACK_WEBHOOK',
        channel: '#deployments',
        templates: {
          success: ({ service, environment, git }) =>
            `✅ ${service.name} to ${environment.name} @ ${git.shortSha}`,
          failure: ({ service, environment, error }) =>
            `🚨 ${service.name} failed in ${environment.name}: ${error}`,
        },
      },
    },
    onEvents: {
      deploySuccess: ['slack'],
      deployFailure: ['slack'],
    },
  },
  hooks: {
    beforeDeploy: [
      async ({ git }) => {
        if (git?.hasUncommittedChanges) {
          throw new Error('Clean working tree required before deploy.');
        }
      },
    ],
    afterDeploy: [
      async ({ kubectl, environment }) => {
        if (!kubectl || !environment) {
          return;
        }

        await kubectl.exec({
          context: environment.cluster.context,
          namespace: environment.namespace,
          podSelector: { app: 'api' },
          container: 'api',
          command: ['node', 'dist/postdeploy.js'],
        });
      },
    ],
    onFailure: [
      async ({ kubectl, environment, service }) => {
        if (!kubectl || !environment || !service) {
          return;
        }

        await kubectl.exec({
          context: environment.cluster.context,
          namespace: environment.namespace,
          podSelector: { app: service.name },
          container: service.name,
          command: ['node', 'dist/rollback.js', `--service=${service.name}`],
        });
      },
    ],
  },
  featureFlags: {
    allowEphemeralEnvironments: true,
    defaultRollbackStrategy: 'previousRelease',
  },
};

config.buildImageTag = buildImageTag;
config.renderManifests = renderManifests;

export default config;
