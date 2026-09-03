# Local development

`tsops dev` runs local application processes behind [Portless](https://portless.sh) so the same application topology has stable names on a laptop instead of manually assigned localhost ports.

## Requirements

- Node.js 24+
- Portless installed globally or available in the project `node_modules/.bin`

```bash
npm install -g portless
```

The first Portless run may ask to trust its local certificate authority so HTTPS works without browser warnings.

## Declare a local namespace

Use the existing namespace runtime model. There is no `portless.json`; `tsops.config.ts` remains the source of truth.

```ts
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'orchard',

  namespaces: {
    dev: {
      runtime: 'local',
      domain: 'dev.example.com'
    },
    prod: {
      runtime: 'kubernetes',
      domain: 'example.com'
    }
  },

  // clusters/images omitted
  apps: {
    api: {
      build: {
        type: 'dockerfile',
        context: './apps/api',
        dockerfile: './apps/api/Dockerfile'
      },
      ports: [{ name: 'http', port: 80, targetPort: 3000 }]
    },
    web: {
      build: {
        type: 'dockerfile',
        context: './apps/web',
        dockerfile: './apps/web/Dockerfile'
      },
      ports: [{ name: 'http', port: 80, targetPort: 5173 }]
    }
  }
})
```

When an app has a Dockerfile build context, `tsops dev` looks for `package.json` in that context. If it has a `dev` script, tsops detects Bun, pnpm, Yarn, or npm from the nearest lockfile and runs that script automatically.

## Override a dev command

For non-standard layouts, add `dev` to the application definition. This is local process metadata only; it does not affect Kubernetes manifests.

```ts
apps: {
  api: {
    dev: {
      command: 'bun',
      args: ['run', 'serve'],
      cwd: './apps/api'
    }
  },

  worker: {
    dev: ['bun', 'run', 'worker']
  },

  migrations: {
    dev: false
  }
}
```

A string is treated as a package script name:

```ts
dev: 'start:local'
```

## Run the topology

```bash
tsops dev
```

If exactly one static namespace has `runtime: 'local'`, it is selected automatically. Otherwise choose one explicitly:

```bash
tsops dev --namespace dev
```

Run only one application with:

```bash
tsops dev --app api
```

A project named `orchard` gets routes such as:

```text
https://api.orchard.localhost
https://web.orchard.localhost
```

Portless owns the ephemeral listening ports and injects `PORT`/`HOST` into child processes. tsops therefore no longer needs a manually coordinated `localPort` for ordinary local HTTP development. `localPort` remains supported for compatibility and for workflows that do not use `tsops dev`.

## Service discovery

Before starting processes, tsops asks Portless for each effective URL and exports the complete map as `TSOPS_DEV_URLS`.

Applications importing the tsops runtime config automatically use those URLs:

```ts
import config from './tsops.config.js'

const api = config.url('api', 'service')
// https://api.orchard.localhost
```

Outside `tsops dev`, local runtime helpers keep their existing fallback:

```text
http://localhost:<localPort ?? targetPort>
```

This keeps existing scripts working while letting `tsops dev` remove port numbers from the normal developer experience.

## Git worktrees and agents

`tsops dev` uses `portless run --name ...`, so Portless applies its Git worktree prefix automatically. A linked worktree can therefore run the same topology without colliding with the main checkout:

```text
main checkout
  https://api.orchard.localhost

feature-auth worktree
  https://feature-auth.api.orchard.localhost
```

The same `TSOPS_DEV_URLS` map is passed to every child process, which means human developers and coding agents can discover the entire local topology without searching for dynamically assigned ports.
