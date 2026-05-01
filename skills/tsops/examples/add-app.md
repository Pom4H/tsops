# Recipe: add a new app

Goal: add a new service `worker` to an existing tsops project.

## Steps

1. **Read `tsops.config.ts`** to find the existing `apps` block and copy the shape of a similar app.
2. **Add the new app** with build, ports, env, and ingress (if public):

   ```ts
   apps: {
     // ...existing apps
     worker: {
       build: {
         type: 'dockerfile',
         context: './apps/worker',
         dockerfile: './apps/worker/Dockerfile'
       },
       ports: [{ name: 'http', port: 80, targetPort: 8080 }],
       env: ({ secret }) => ({
         JWT_SECRET: secret('api-secrets', 'JWT_SECRET')
       })
       // No ingress — internal-only worker
     }
   }
   ```

3. **Create the Dockerfile** at the declared path if it doesn't exist.
4. **Run `tsc --noEmit`** — adding an app is non-breaking; this should pass.
5. **Run `tsops plan --namespace <ns>`** — confirm the planned changes show only `Will create: Deployment/<project>-worker, Service/<project>-worker`.
6. **Run `tsops build --app worker`** to build the image.
7. **Run `tsops deploy --namespace <ns> --app worker`**.

## Common mistakes

- **Adding a hardcoded `BACKEND_URL` to the new app's env.** Don't. Use `config.url('api', 'service')` in the worker's source code.
- **Forgetting `ports`.** Without `ports`, no Service is created and other apps can't dial it via `config.url(..., 'service')`.
- **Naming the app with underscores or capitals.** App names become DNS labels — lowercase, hyphens only.

## What to report

After deploy, tell the user:
- The new app's name and namespace
- The internal DNS (`<app>` for same-namespace, `<app>.<ns>.svc.cluster.local` cross-namespace)
- Whether any orphaned resources were pruned
