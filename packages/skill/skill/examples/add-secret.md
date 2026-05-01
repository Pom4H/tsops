# Recipe: add a secret

Goal: add `SENTRY_DSN` to the `api` app, populated from CI in production and a static dev value locally.

## Steps

1. **Pick the secret name.** Group related keys under one secret (`api-secrets`, `db-secrets`, `payment-secrets`). Don't create a one-key secret per value.

2. **Add the key to the secret resolver** at config root:

   ```ts
   secrets: {
     'api-secrets': ({ production }) => ({
       JWT_SECRET: production ? process.env.JWT_SECRET ?? '' : 'dev-jwt',
       SENTRY_DSN: production ? process.env.SENTRY_DSN ?? '' : ''   // new
     })
   }
   ```

3. **Reference it from the app** via the `secret()` helper:

   ```ts
   apps: {
     api: {
       env: ({ secret }) => ({
         JWT_SECRET: secret('api-secrets', 'JWT_SECRET'),
         SENTRY_DSN: secret('api-secrets', 'SENTRY_DSN')   // new
       })
     }
   }
   ```

4. **Provide the value to CI.** Add `SENTRY_DSN` as a CI secret. Locally, the empty fallback means `process.env.SENTRY_DSN` is empty — Sentry will no-op, which is the desired dev behavior.

5. **Run `tsops plan --namespace prod`** with the env var set:

   ```bash
   SENTRY_DSN=https://... tsops plan --namespace prod
   ```

   Expect: `Update: Secret/api-secrets` with the new key. If validation fails, read the error — usually a placeholder slipped in.

6. **Deploy**: `tsops deploy --namespace prod`.

## Reading the secret in app code

```ts
// API uses the env var directly — Kubernetes injects it at pod start
const sentryDsn = process.env.SENTRY_DSN
```

This is the **one** case where reading from `process.env` in app code is correct: tsops injected it via `valueFrom.secretKeyRef`, so the value is the cluster's, not the developer's shell.

## Common mistakes

- **Hardcoding the production value.** `SENTRY_DSN: 'https://abc@sentry.io/123'` in the resolver bakes the value into the TypeScript file. Don't.
- **Adding a value-only key without a fallback.** `SENTRY_DSN: process.env.SENTRY_DSN ?? ''` — never `process.env.SENTRY_DSN!`. The `!` non-null assertion bypasses tsops's missing-value validation.
- **Adding the secret name to `env` without declaring it in `secrets`.** Compile error: secret name is type-checked against the declared map.
- **Re-using a secret name across unrelated apps.** Tolerated but error-prone — when the secret schema changes, every consumer breaks at once.
