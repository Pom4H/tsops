# Quick start

Use an existing Node.js 24 application with a `dev` script and a Dockerfile.

## 1. Install

```bash
pnpm add -D tsops portless
```

## 2. Define the application

Create `tsops.config.ts`:

```ts
import { defineConfig } from 'tsops'

const config = defineConfig({
  project: 'hello',

  namespaces: {
    local: {
      runtime: 'local',
      domain: 'hello.localhost'
    },
    production: {
      runtime: 'kubernetes',
      domain: 'hello.example.com'
    }
  },

  clusters: {
    production: {
      apiServer: 'https://kubernetes.example.com:6443',
      context: 'production',
      namespaces: ['production']
    }
  },

  images: {
    registry: 'ghcr.io/acme/hello',
    tagStrategy: 'git-sha'
  },

  apps: {
    web: {
      build: {
        type: 'dockerfile',
        context: '.',
        dockerfile: 'Dockerfile'
      },
      ingress: ({ domain }) => ({ domain }),
      ports: [{ name: 'http', port: 80, targetPort: 3000 }]
    }
  }
})

export default config
```

Your `package.json` should expose the local process:

```json
{
  "scripts": {
    "dev": "node --watch server.js"
  }
}
```

The process must listen on `process.env.PORT`; Portless supplies it.

## 3. Run locally

```bash
pnpm tsops dev
```

Open the URL printed for `web`, normally:

```text
https://web.hello.localhost
```

## 4. Inspect production resources

First validate without Docker or cluster access:

```bash
pnpm tsops plan --namespace production --dry-run
```

Then compare against the configured Kubernetes context:

```bash
pnpm tsops plan --namespace production
```

## 5. Build and deploy

```bash
pnpm tsops build --namespace production --source-key
pnpm tsops deploy --namespace production
```

That is the basic loop. The same `web` key now identifies the local route, image, Kubernetes workload, Service, ingress, and runtime endpoint.

Next: [Getting started](/guide/getting-started), [Local development](/guide/local-development), and [How tsops compares](/guide/comparison).
