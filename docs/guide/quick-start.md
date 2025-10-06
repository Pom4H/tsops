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
    prod: { domain: 'example.com' }
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
      env: ({ production }) => ({ NODE_ENV: production ? 'production' : 'development' })
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

## 5. Deploy

```bash
GIT_SHA=$(git rev-parse HEAD) pnpm tsops deploy --namespace prod
```

## 6. Verify

```bash
kubectl get pods -n prod
```

## That's It! 🎉

Your app is now running in Kubernetes!

## Next Steps

- [Add secrets](/guide/secrets)
- [Configure networking](/guide/networking)
- [Multi-environment setup](/guide/multi-environment)


