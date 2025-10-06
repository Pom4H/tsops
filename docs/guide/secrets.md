# Secrets & ConfigMaps

Learn how to securely manage secrets and configuration in tsops.

## Secret Management

tsops provides powerful secret management with automatic validation.

### Basic Usage

Define secrets at the config root level (not within apps):

```typescript
export default defineConfig({
  project: 'my-app',
  
  namespaces: {
    dev: { production: false },
    prod: { production: true }
  },
  
  // Secrets are defined at config root level
  secrets: {
    'api-secrets': ({ production, env }) => ({
      JWT_SECRET: env('JWT_SECRET', production ? undefined : 'dev-jwt'),
      DB_PASSWORD: env('DB_PASSWORD', production ? undefined : 'dev-password'),
      API_KEY: env('API_KEY', production ? undefined : 'dev-key')
    })
  },
  
  apps: {
    api: {
      // Reference secrets in env using secret() helper
      env: ({ secret }) => ({
        JWT_SECRET: secret('api-secrets', 'JWT_SECRET'),
        DB_PASSWORD: secret('api-secrets', 'DB_PASSWORD')
      })
    }
  }
})
```

### envFrom: Reference Entire Secret

Use `secret()` helper to inject all keys from a secret:

```typescript
// Define secrets at config root level
secrets: {
  'api-secrets': ({ production, env }) => ({
    JWT_SECRET: env('JWT_SECRET', production ? undefined : 'dev-jwt'),
    DB_PASSWORD: env('DB_PASSWORD', production ? undefined : 'dev-password')
  })
},

apps: {
  api: {
    // Reference entire secret as envFrom
    env: ({ secret }) => secret('api-secrets')  // ← envFrom: secretRef
  }
}
```

This generates:

```yaml
envFrom:
  - secretRef:
      name: api-secrets
```

### valueFrom: Reference Specific Keys

Mix static values with secret references:

```typescript
apps: {
  api: {
    env: ({ secret }) => ({
      PORT: '3000',                                    // Static
      JWT_SECRET: secret('api-secrets', 'JWT_SECRET'),  // From secret
      DB_PASSWORD: secret('api-secrets', 'DB_PASSWORD') // From secret
    })
  }
}
```

This generates:

```yaml
env:
  - name: PORT
    value: "3000"
  - name: JWT_SECRET
    valueFrom:
      secretKeyRef:
        name: api-secrets
        key: JWT_SECRET
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: api-secrets
        key: DB_PASSWORD
```

## Secret Validation

tsops **automatically validates** secrets before deployment.

### What's Validated

✅ No undefined values  
✅ No placeholder values (`change-me`, `replace-me`, `todo`, `fixme`)  
✅ No references to missing environment variables  

### Example: Missing Values

```typescript
secrets: {
  'api-secrets': {
    JWT_SECRET: process.env.PROD_JWT,  // ← undefined!
    DB_PASSWORD: 'change-me'            // ← placeholder!
  }
}
```

tsops will show:

```
❌ Secret "api-secrets" for app "api" contains missing or placeholder values.

Missing/placeholder keys:
  - JWT_SECRET = "undefined"
  - DB_PASSWORD = "change-me"

Secret does not exist in cluster (namespace: "production").

Please provide actual values by:
  1. Setting environment variables before deployment
  2. Updating your tsops.config.ts with real values
  3. Creating the secret manually in the cluster first
```

### Fallback to Cluster Secrets

If validation fails, tsops checks if the secret exists in the cluster:

```bash
kubectl get secret api-secrets -n production
```

If found, tsops uses the existing secret. This allows:

- ✅ Manual secret creation
- ✅ Secret rotation without config changes
- ✅ Different secrets per environment

## ConfigMaps

Similar to secrets, but for non-sensitive configuration.

### Basic Usage

ConfigMaps are defined at config root level, similar to secrets:

```typescript
export default defineConfig({
  // ConfigMaps at root level
  configMaps: {
    'api-config': {
      LOG_LEVEL: 'info',
      MAX_CONNECTIONS: '100',
      FEATURE_FLAGS: 'auth,payments,notifications'
    }
  },
  
  apps: {
    api: {
      // Reference in env
      env: ({ configMap }) => ({
        LOG_LEVEL: configMap('api-config', 'LOG_LEVEL')
      })
    }
  }
})
```

### envFrom: Reference Entire ConfigMap

```typescript
// Define at root level
configMaps: {
  'api-config': {
    LOG_LEVEL: 'info',
    FEATURE_FLAGS: 'auth,payments'
  }
},

apps: {
  api: {
    // Reference entire configMap as envFrom
    env: ({ configMap }) => configMap('api-config')
  }
}
```

### valueFrom: Reference Specific Keys

```typescript
apps: {
  api: {
    env: ({ configMap }) => ({
      LOG_LEVEL: configMap('api-config', 'LOG_LEVEL'),
      MAX_CONNECTIONS: configMap('api-config', 'MAX_CONNECTIONS')
    })
  }
}
```

## Best Practices

### ✅ Use environment variables for secrets

```typescript
secrets: {
  'api-secrets': ({ production, env }) => ({
    JWT_SECRET: env('PROD_JWT', production ? undefined : 'dev-jwt')
  })
}
```

Then deploy with:

```bash
PROD_JWT=xxx PROD_DB_PWD=yyy pnpm tsops deploy --namespace prod
```

### ✅ Different secrets per environment

```typescript
secrets: {
  'api-secrets': ({ production, env }) => ({
    JWT_SECRET: env('JWT_SECRET', production ? undefined : 'dev-jwt-secret'),
    DB_PASSWORD: env('DB_PASSWORD', production ? undefined : 'dev-password')
  })
}
```

### ✅ Use serviceDNS in secrets

```typescript
secrets: {
  'api-secrets': ({ serviceDNS, env }) => ({
    DATABASE_URL: template('postgresql://{user}:{pwd}@{host}/{db}', {
      user: 'myuser',
      pwd: env('DB_PASSWORD'),
      host: serviceDNS('postgres', 5432),
      db: 'myapp'
    })
  })
}
```

### ❌ Don't hardcode secrets

```typescript
secrets: {
  'api-secrets': {
    JWT_SECRET: 'hardcoded-secret'  // ❌ Never do this!
  }
}
```

### ❌ Don't commit secrets to git

```bash
# .gitignore
.env
.env.local
.env.production
```

## Runtime Access

Access resolved environment variables at runtime directly from your config object:

```typescript
// server.ts
import config from './tsops.config'

// Set TSOPS_NAMESPACE to determine which namespace to use
process.env.TSOPS_NAMESPACE = 'prod'

// Get resolved environment for an app
const env = config.getEnv('api')
console.log('JWT_SECRET:', env.JWT_SECRET)
console.log('DB_PASSWORD:', env.DB_PASSWORD)

// Or get full app info including endpoints
const app = config.getApp('api')
console.log('Internal endpoint:', app.internalEndpoint)
console.log('External endpoint:', config.getExternalEndpoint('api'))
console.log('Environment:', app.env)
```

This provides:
- ✅ Single source of truth
- ✅ Type-safe environment access  
- ✅ Works in dev and production
- ✅ No duplication
- ✅ Built-in - no extra packages needed

## Security Checklist

- [ ] All production secrets from environment variables
- [ ] No secrets in git
- [ ] .env files in .gitignore
- [ ] Different secrets per environment
- [ ] Secret rotation plan
- [ ] Access controls on secrets
- [ ] Audit logging enabled

## Next Steps

- [Context Helpers](/guide/context-helpers)
- [Getting Started](/guide/getting-started)
- [API Reference](/api/)

