# Quick Start

Deploy your first app to Kubernetes in 5 minutes.

## 1. Install

```bash
pnpm add tsops
```

## 2. Create Config

Create `tsops.config.ts`:

```typescript
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'hello',
  
  namespaces: {
    prod: { 
      domain: 'example.com',
      production: true 
    }
  },
  
  clusters: {
    production: {
      apiServer: 'https://your-k8s:6443',
      context: 'production',
      namespaces: ['prod']
    }
  },
  
  images: {
    registry: 'ghcr.io/yourorg',
    tagStrategy: 'git-sha'
  },
  
  apps: {
    web: {
      build: {
        type: 'dockerfile',
        context: './web',
        dockerfile: './web/Dockerfile'
      },
      network: ({ domain }) => `www.${domain}`,
      ports: [{ name: 'http', port: 80, targetPort: 3000 }],
      env: ({ production }) => ({ 
        NODE_ENV: production ? 'production' : 'development' 
      })
    }
  }
})
```

## 3. Create Dockerfile

Create `web/Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "index.js"]
```

## 4. Create App

Create `web/index.js`:

```javascript
const http = require('http')

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Hello from tsops!')
})

server.listen(3000, () => {
  console.log('Server running on port 3000')
})
```

## 5. Plan & Deploy

Preview the rollout, then apply it:

```bash
pnpm tsops plan --namespace prod
pnpm tsops deploy --namespace prod
```

`tsops plan` shows global validation, per-app manifest diffs, and any orphaned resources that would be removed. Add `--dry-run` to avoid contacting Docker or kubectl while testing the workflow.

## 6. Verify

```bash
kubectl get pods -n prod
```

## That's It! 🎉

Your app is now running in Kubernetes!

## Next Steps

- [Getting Started guide](/guide/getting-started)
- [Context helpers tour](/guide/context-helpers)
- [Secrets & ConfigMaps](/guide/secrets)
- [What is tsops?](/guide/what-is-tsops)
