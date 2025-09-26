import path from 'node:path'
import { defineConfig } from '../../dist/index.js'

const serviceMeta = {
  frontend: {
    packageName: '@monorepo/frontend',
    serviceDir: 'apps/frontend',
    port: 3000
  },
  backend: {
    packageName: '@monorepo/backend',
    serviceDir: 'apps/backend',
    port: 4000
  }
} satisfies Record<
  string,
  {
    packageName: string
    serviceDir: string
    port: number
  }
>

const backendSecretName = 'monorepo-backend-env'

const namespaceManifest = (namespace: string) => ({
  apiVersion: 'v1',
  kind: 'Namespace',
  metadata: { name: namespace }
})

const config = defineConfig({
  project: {
    name: 'tsops-monorepo-demo',
    repoUrl: 'https://github.com/Pom4H/tsops',
    defaultBranch: 'main'
  },
  environments: {
    local: {
      cluster: {
        apiServer: 'https://kubernetes.docker.internal:6443',
        context: 'docker-desktop'
      },
      namespace: 'tsops-monorepo',
      imageTagStrategy: { type: 'gitSha' },
      ingressController: {
        type: 'traefik',
        namespace: 'traefik-system',
        autoInstall: true,
        serviceType: 'LoadBalancer'
      },
      tls: {
        selfSigned: {
          enabled: false
        }
      }
    },
    production: {
      cluster: {
        apiServer: process.env.K8_URL!,
        context: process.env.K8_CONTEXT!
      },
      namespace: 'tsops-monorepo-prod',
      imageTagStrategy: { type: 'gitSha' },
      registry: {
        url: process.env.REGISTRY_URL!,
        username: process.env.REGISTRY_USERNAME,
        password: process.env.REGISTRY_PASSWORD
      },
      ingressController: {
        type: 'traefik',
        namespace: 'traefik-system',
        autoInstall: true,
        serviceType: 'LoadBalancer'
      },
      tls: {
        selfSigned: {
          enabled: false
        },
        letsEncrypt: {
          enabled: true,
          email: process.env.LETSENCRYPT_EMAIL!,
          staging: false
        }
      }
    }
  },
  services: {
    backend: {
      containerImage: 'tsops-monorepo-backend',
      defaultEnvironment: 'local',
      build: {
        type: 'dockerfile',
        context: import.meta.dirname,
        dockerfile: path.join(import.meta.dirname, serviceMeta.backend.serviceDir, 'Dockerfile'),
        platform: 'linux/amd64',
        buildArgs: {
          PACKAGE_NAME: serviceMeta.backend.packageName,
          SERVICE_DIR: serviceMeta.backend.serviceDir,
          NODE_VERSION: '24'
        },
        env: { DOCKER_BUILDKIT: '1' }
      },
      manifests: ({ env, image }) => {
        const labels = { app: 'monorepo-backend' }
        return [
          namespaceManifest(env.namespace),
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name: 'backend',
              namespace: env.namespace,
              labels
            },
            spec: {
              replicas: 1,
              selector: { matchLabels: labels },
              template: {
                metadata: {
                  labels,
                  annotations: {
                    'tsops.dev/force-rollout': new Date().toISOString()
                  }
                },
                spec: {
                  containers: [
                    {
                      name: 'backend',
                      image,
                      imagePullPolicy: 'Always',
                      ports: [{ containerPort: serviceMeta.backend.port }],
                      env: [
                        { name: 'PORT', value: String(serviceMeta.backend.port) },
                        { name: 'NODE_ENV', value: 'production' },
                        { name: 'RELEASE', value: env.name },
                        {
                          name: 'FRONTEND_URL',
                          value: `http://frontend.${env.namespace}.svc.cluster.local:${serviceMeta.frontend.port}`
                        }
                      ],
                      envFrom: [
                        {
                          secretRef: { name: backendSecretName }
                        }
                      ]
                    }
                  ]
                }
              }
            }
          },
          {
            apiVersion: 'v1',
            kind: 'Service',
            metadata: {
              name: 'backend',
              namespace: env.namespace
            },
            spec: {
              selector: labels,
              ports: [
                {
                  name: 'http',
                  port: serviceMeta.backend.port,
                  targetPort: serviceMeta.backend.port
                }
              ],
              type: 'ClusterIP'
            }
          },
          // HTTP IngressRoute for backend (web)
          {
            apiVersion: 'traefik.io/v1alpha1',
            kind: 'IngressRoute',
            metadata: {
              name: 'backend-http',
              namespace: env.namespace
            },
            spec: {
              entryPoints: ['web'],
              routes: [
                {
                  match: `Host(\`tsops2.worken.online\`)`,
                  kind: 'Rule',
                  services: [
                    {
                      name: 'backend',
                      port: 'http'
                    }
                  ]
                }
              ]
            }
          },
          // HTTPS IngressRoute for backend (websecure) with TLS
          {
            apiVersion: 'traefik.io/v1alpha1',
            kind: 'IngressRoute',
            metadata: {
              name: 'backend-https',
              namespace: env.namespace
            },
            spec: {
              entryPoints: ['websecure'],
              routes: [
                {
                  match: `Host(\`tsops2.worken.online\`)`,
                  kind: 'Rule',
                  services: [
                    {
                      name: 'backend',
                      port: 'http'
                    }
                  ]
                }
              ],
              tls: {
                certResolver: 'letsencrypt',
                domains: [
                  {
                    main: 'tsops2.worken.online'
                  }
                ]
              }
            }
          }
        ]
      }
    },
    frontend: {
      containerImage: 'tsops-monorepo-frontend',
      defaultEnvironment: 'local',
      dependsOn: ['backend'],
      build: {
        type: 'dockerfile',
        context: import.meta.dirname,
        dockerfile: path.join(import.meta.dirname, serviceMeta.frontend.serviceDir, 'Dockerfile'),
        platform: 'linux/amd64',
        buildArgs: {
          PACKAGE_NAME: serviceMeta.frontend.packageName,
          SERVICE_DIR: serviceMeta.frontend.serviceDir,
          NODE_VERSION: '24',
          NEXT_PUBLIC_WS_URL: 'wss://tsops2.worken.online/ws'
        },
        env: { DOCKER_BUILDKIT: '1' }
      },
      manifests: ({ env, image }) => {
        const labels = { app: 'monorepo-frontend' }
        const host = 'tsops.worken.online'
        return [
          namespaceManifest(env.namespace),
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name: 'frontend',
              namespace: env.namespace,
              labels
            },
            spec: {
              replicas: 1,
              selector: { matchLabels: labels },
              template: {
                metadata: {
                  labels,
                  annotations: {
                    'tsops.dev/force-rollout': new Date().toISOString()
                  }
                },
                spec: {
                  containers: [
                    {
                      name: 'frontend',
                      image,
                      imagePullPolicy: 'Always',
                      ports: [{ containerPort: serviceMeta.frontend.port }],
                      env: [
                        { name: 'PORT', value: String(serviceMeta.frontend.port) },
                        { name: 'NODE_ENV', value: 'production' },
                        { name: 'PAGE_TITLE', value: 'Turbo Monorepo Frontend' },
                        {
                          name: 'BACKEND_INTERNAL_URL',
                          value: `http://backend.${env.namespace}.svc.cluster.local:${serviceMeta.backend.port}`
                        },
                        {
                          name: 'BACKEND_PUBLIC_URL',
                          value: '/api'
                        },
                        {
                          name: 'NEXT_PUBLIC_WS_URL',
                          value: `wss://tsops2.worken.online/ws`
                        }
                      ]
                    }
                  ]
                }
              }
            }
          },
          {
            apiVersion: 'v1',
            kind: 'Service',
            metadata: {
              name: 'frontend',
              namespace: env.namespace
            },
            spec: {
              selector: labels,
              ports: [
                {
                  name: 'http',
                  port: 80,
                  targetPort: serviceMeta.frontend.port
                }
              ],
              type: 'ClusterIP'
            }
          },
          // HTTP IngressRoute (web)
          {
            apiVersion: 'traefik.io/v1alpha1',
            kind: 'IngressRoute',
            metadata: {
              name: 'frontend-http',
              namespace: env.namespace
            },
            spec: {
              entryPoints: ['web'],
              routes: [
                {
                  match: `Host(\`${host}\`)`,
                  kind: 'Rule',
                  services: [
                    {
                      name: 'frontend',
                      port: 'http'
                    }
                  ]
                }
              ]
            }
          },
          // HTTPS IngressRoute (websecure) with TLS
          {
            apiVersion: 'traefik.io/v1alpha1',
            kind: 'IngressRoute',
            metadata: {
              name: 'frontend-https',
              namespace: env.namespace
            },
            spec: {
              entryPoints: ['websecure'],
              routes: [
                {
                  match: `Host(\`${host}\`)`,
                  kind: 'Rule',
                  services: [
                    {
                      name: 'frontend',
                      port: 'http'
                    }
                  ]
                }
              ],
              tls: {
                certResolver: 'letsencrypt',
                domains: [
                  {
                    main: host
                  }
                ]
              }
            }
          }
        ]
      }
    }
  },
  hooks: {
    beforeDeploy: [
      async ({ kubectl, environment, service }) => {
        if (!kubectl || !environment || !service || service.name !== 'backend') {
          return
        }

        const token = process.env.BACKEND_API_TOKEN ?? ''
        if (!process.env.BACKEND_API_TOKEN) {
          console.warn(
            '[tsops] BACKEND_API_TOKEN not set; creating backend secret with empty token.'
          )
        }

        await kubectl.apply({
          context: environment.cluster.context,
          namespace: environment.namespace,
          manifests: [
            {
              apiVersion: 'v1',
              kind: 'Secret',
              metadata: {
                name: backendSecretName,
                namespace: environment.namespace,
                labels: {
                  'app.kubernetes.io/name': 'backend',
                  'app.kubernetes.io/component': 'api'
                }
              },
              type: 'Opaque',
              stringData: {
                API_TOKEN: token
              }
            }
          ]
        })
      }
    ]
  }
})

export default config
