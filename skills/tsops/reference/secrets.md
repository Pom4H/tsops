# Secrets and ConfigMaps

Secrets are declared at config root and referenced by apps via the `secret()` helper.

## Declaring a secret

```ts
secrets: {
  'api-secrets': ({ production }) => ({
    JWT_SECRET: production
      ? process.env.JWT_SECRET ?? ''
      : 'dev-secret-not-for-prod',
    STRIPE_KEY: production
      ? process.env.STRIPE_KEY ?? ''
      : 'sk_test_xxx'
  })
}
```

The resolver function runs at plan/deploy time in Node — `process.env` is the developer's shell, **not** the cluster. Production values come from CI env vars.

## Referencing a secret from an app

```ts
apps: {
  api: {
    env: ({ secret }) => ({
      JWT_SECRET: secret('api-secrets', 'JWT_SECRET'),  // valueFrom.secretKeyRef
      STRIPE_KEY: secret('api-secrets', 'STRIPE_KEY')
    })
  }
}
```

Or pull every key as `envFrom`:

```ts
env: ({ secret }) => secret('api-secrets')   // entire secret as envFrom
```

The secret name and key are type-checked. Typos are compile errors.

## Validation

`tsops plan` validates secrets before any cluster changes. It rejects:

- Undefined values (`process.env.MISSING ?? ''`)
- Placeholder values (`change-me`, `replace-me`, `todo`, `fixme`)
- Missing required keys

If validation fails, tsops checks if the secret already exists in the cluster. If yes, it reuses the cluster value. If no, the deploy is blocked with an actionable error.

This means: **secret rotation can happen via `kubectl edit secret` without a tsops deploy.** The config declares the schema; the cluster owns the value.

## Common patterns

```ts
// ✅ Different secrets per environment
secrets: {
  'api-secrets': ({ production }) => ({
    JWT_SECRET: production ? process.env.JWT_SECRET ?? '' : 'dev-jwt',
    DB_URL:     production ? process.env.DB_URL     ?? '' : 'postgres://localhost/dev'
  })
}

// ✅ External database URL — template helper
secrets: {
  'db-secrets': ({ template, env, production }) => ({
    DATABASE_URL: template('postgresql://{user}:{pwd}@{host}:5432/{db}', {
      user: env('DB_USER', 'admin'),
      pwd:  env('DB_PASSWORD'),
      host: production ? 'prod-db.internal' : 'dev-db.internal',
      db:   'myapp'
    })
  })
}

// ❌ Hardcoded — fails validation, but only because the placeholder list catches it.
// Do not rely on validation to catch all hardcoded secrets.
secrets: {
  'api-secrets': () => ({
    JWT_SECRET: 'super-secret-prod-value'
  })
}
```

## ConfigMaps

Same shape, different intent: ConfigMaps are for non-sensitive config (log level, feature flags, public endpoints).

```ts
configMaps: {
  'api-config': {
    LOG_LEVEL: 'info',
    FEATURE_FLAGS: 'auth,payments'
  }
}

// In app:
env: ({ configMap }) => ({
  LOG_LEVEL: configMap('api-config', 'LOG_LEVEL')
})
```

ConfigMaps are not validated for placeholders — they're allowed to contain "TODO" and similar strings.
