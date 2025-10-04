# Secrets & ConfigMaps

Learn how to securely manage secrets and configuration in tsops.

## Secret Management

tsops provides powerful secret management with automatic validation.

### Basic Usage

```typescript
export default defineConfig({
  apps: {
    api: {
      secrets: ({ production }) => ({
        'api-secrets': {
          JWT_SECRET: production ? process.env.PROD_JWT! : 'dev-jwt',
          DB_PASSWORD: production ? process.env.PROD_DB_PWD! : 'dev-password',
          API_KEY: production ? process.env.API_KEY! : 'dev-key'
        }
      })
    }
  }
})
```

### envFrom: Reference Entire Secret

Use `secret()` helper to inject all keys from a secret:

```typescript
apps: {
  api: {
    // Reference entire secret
    env: ({ secret, production }) => {
      if (production) {
        return secret('api-secrets')  // ← envFrom: secretRef
      }
      return {
        JWT_SECRET: 'dev-jwt',
        DB_PASSWORD: 'dev-password'
      }
    },
    
    // Define the secret
    secrets: ({ production }) => ({
      'api-secrets': {
        JWT_SECRET: production ? process.env.PROD_JWT! : 'dev-jwt',
        DB_PASSWORD: production ? process.env.PROD_DB_PWD! : 'dev-password'
      }
    })
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
    env: ({ secretKey }) => ({
      PORT: '3000',                                      // Static
      JWT_SECRET: secretKey('api-secrets', 'JWT_SECRET'),  // From secret
      DB_PASSWORD: secretKey('api-secrets', 'DB_PASSWORD') // From secret
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

```typescript
apps: {
  api: {
    configMaps: () => ({
      'api-config': {
        LOG_LEVEL: 'info',
        MAX_CONNECTIONS: '100',
        FEATURE_FLAGS: 'auth,payments,notifications'
      }
    })
  }
}
```

### envFrom: Reference Entire ConfigMap

```typescript
apps: {
  api: {
    env: ({ configMap, production }) => {
      if (production) {
        return configMap('api-config')
      }
      return { LOG_LEVEL: 'debug' }
    },
    
    configMaps: () => ({
      'api-config': {
        LOG_LEVEL: 'info',
        FEATURE_FLAGS: 'auth,payments'
      }
    })
  }
}
```

### valueFrom: Reference Specific Keys

```typescript
apps: {
  api: {
    env: ({ configMapKey }) => ({
      LOG_LEVEL: configMapKey('api-config', 'LOG_LEVEL'),
      MAX_CONNECTIONS: configMapKey('api-config', 'MAX_CONNECTIONS')
    })
  }
}
```

## Best Practices

### ✅ Use environment variables for secrets

```typescript
secrets: ({ production }) => ({
  'api-secrets': {
    JWT_SECRET: production ? process.env.PROD_JWT! : 'dev-jwt'
  }
})
```

Then deploy with:

```bash
PROD_JWT=xxx PROD_DB_PWD=yyy pnpm tsops deploy --namespace prod
```

### ✅ Different secrets per environment

```typescript
secrets: ({ production, dev }) => {
  if (production) {
    return {
      'api-secrets': {
        JWT_SECRET: process.env.PROD_JWT!,
        DB_PASSWORD: process.env.PROD_DB_PWD!
      }
    }
  }
  
  if (dev) {
    return {
      'api-secrets': {
        JWT_SECRET: 'dev-jwt-secret',
        DB_PASSWORD: 'dev-password'
      }
    }
  }
}
```

### ✅ Use serviceDNS in secrets

```typescript
secrets: ({ serviceDNS, production }) => ({
  'api-secrets': {
    DATABASE_URL: `postgres://user:${process.env.DB_PWD}@${serviceDNS('postgres', 5432)}/db`
  }
})
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

Use `@tsops/runtime` to access secrets at runtime:

```typescript
// server.ts
import { getEnv } from '@tsops/runtime'
import config from './tsops.config'

async function start() {
  const env = await getEnv(config, 'api', process.env.NAMESPACE!)
  
  console.log('JWT_SECRET:', env.JWT_SECRET)
  console.log('DB_PASSWORD:', env.DB_PASSWORD)
}
```

This provides:
- ✅ Single source of truth
- ✅ Type-safe environment access
- ✅ Works in dev and production
- ✅ No duplication

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
- [Multi-Environment](/guide/multi-environment)
- [Runtime Package](/api/runtime)


