import { defineConfig } from 'tsops'

const config = defineConfig({
  project: 'tsops-otel-demo',
  namespaces: {
    dev: { domain: 'test.worken.online' }
  },
  clusters: {
    dev: {
      apiServer: 'https://kubernetes.docker.internal:6443',
      context: 'docker-desktop',
      namespaces: ['dev']
    }
  },
  images: {
    registry: 'ghcr.io/acme',
    tagStrategy: 'git-sha',
    includeProjectInName: true
  },
  secrets: {
    'otel-api-secrets': () => ({
      JWT_SECRET: process.env.JWT_SECRET ?? 'dev-jwt',
      DB_PASSWORD: process.env.DB_PASSWORD ?? 'dev-pass',
      API_KEY: process.env.API_KEY ?? 'dev-api-key'
    })
  },
  configMaps: {
    'otel-collector-config': () => ({
      'otel-collector.yaml': JSON.stringify({
        receivers: {
          otlp: { protocols: { http: { endpoint: '0.0.0.0:4318' } } }
        },
        exporters: {
          logging: { loglevel: 'info' }
        },
        processors: { batch: {} },
        extensions: {},
        service: {
          extensions: [],
          pipelines: {
            traces: { receivers: ['otlp'], processors: ['batch'], exporters: ['logging'] },
            metrics: { receivers: ['otlp'], processors: ['batch'], exporters: ['logging'] }
          }
        }
      })
    }),
    'loki-config': () => ({
      'loki-local.yaml': JSON.stringify({
        server: { http_listen_port: 3100 },
        common: {
          path: '/loki',
          storage: { filesystem: { chunks_directory: '/loki/chunks', rules_directory: '/loki/rules' } },
          replication_factor: 1
        },
        schema_config: {
          configs: [
            {
              from: '2020-10-24',
              store: 'boltdb-shipper',
              object_store: 'filesystem',
              schema: 'v11',
              index: { prefix: 'index_', period: '24h' }
            }
          ]
        },
        ruler: { alertmanager_url: 'http://localhost:9093' }
      })
    }),
    'grafana-provisioning': () => ({
      'datasources.yaml': JSON.stringify({
        apiVersion: 1,
        datasources: [
          { name: 'Loki', type: 'loki', access: 'proxy', url: 'http://loki:3100', isDefault: true }
        ]
      })
    })
  },
  apps: {
    otelCollector: {
      image: 'otel/opentelemetry-collector:latest',
      env: () => ({}),
      ports: [
        { name: 'otlp-http', port: 4318, targetPort: 4318 }
      ],
      volumes: [
        { name: 'otel-config', configMap: { name: 'otel-collector-config' } }
      ],
      volumeMounts: [
        { name: 'otel-config', mountPath: '/etc/otel' }
      ],
      network: false
    },
    loki: {
      image: 'grafana/loki:latest',
      env: () => ({}),
      ports: [{ name: 'http', port: 3100, targetPort: 3100 }],
      volumes: [
        { name: 'loki-config', configMap: { name: 'loki-config' } }
      ],
      volumeMounts: [
        { name: 'loki-config', mountPath: '/etc/loki' }
      ],
      network: false
    },
    grafana: {
      image: 'grafana/grafana:latest',
      env: () => ({}),
      ports: [{ name: 'http', port: 3000, targetPort: 3000 }],
      volumes: [
        { name: 'grafana-provisioning', configMap: { name: 'grafana-provisioning' } }
      ],
      volumeMounts: [
        { name: 'grafana-provisioning', mountPath: '/etc/grafana/provisioning/datasources' }
      ],
      network: ({ domain }) => `grafana.${domain}`
    },
    postgres: {
      image: 'postgres:18',
      env: ({ secret }) => ({
        POSTGRES_PASSWORD: secret('otel-api-secrets', 'DB_PASSWORD')
      }),
      ports: [{ name: 'db', port: 5432, targetPort: 5432 }],
      network: false
    },
    api: {
      build: {
        type: 'dockerfile',
        context: 'examples/otel/apps/api',
        dockerfile: 'examples/otel/apps/api/Dockerfile'
      },
      env: ({ namespace, cluster, secret, project, appName, serviceDNS }) => ({
        NODE_ENV: 'production',
        NAMESPACE: namespace,
        CLUSTER: cluster.name,
        OTEL_SERVICE_NAME: `${project}-${appName}`,
        OTEL_EXPORTER_OTLP_ENDPOINT: serviceDNS('otelCollector', { protocol: 'http', port: 4318 }),
        JWT_SECRET: secret('otel-api-secrets', 'JWT_SECRET'),
        DB_PASSWORD: secret('otel-api-secrets', 'DB_PASSWORD'),
        API_KEY: secret('otel-api-secrets', 'API_KEY')
      }),
      ports: [{ name: 'http', port: 80, targetPort: 3000 }],
      network: ({ domain }) => `api.${domain}`
    },
    frontend: {
      build: {
        type: 'dockerfile',
        context: 'examples/otel/apps/frontend',
        dockerfile: 'examples/otel/apps/frontend/Dockerfile'
      },
      env: ({ namespace, cluster, project, appName, serviceDNS }) => ({
        NODE_ENV: 'production',
        NAMESPACE: namespace,
        CLUSTER: cluster.name,
        OTEL_SERVICE_NAME: `${project}-${appName}`,
        OTEL_EXPORTER_OTLP_ENDPOINT: serviceDNS('otelCollector', { protocol: 'http', port: 4318 })
      }),
      ports: [{ name: 'http', port: 80, targetPort: 3000 }],
      network: ({ domain }) => domain
    }
  }
})

export default config
