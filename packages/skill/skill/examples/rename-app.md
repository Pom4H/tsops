# Recipe: rename an app

Goal: rename `api` → `core-api` across the entire project.

This is the canonical demonstration of why tsops exists. The TypeScript compiler does most of the work.

## Steps

1. **Edit `tsops.config.ts`** — change the key in `apps`:

   ```ts
   apps: {
     'core-api': {       // was: api
       build: { ... },
       ports: [...],
       env: ({ secret }) => ({ ... })
     }
   }
   ```

2. **Run `tsc --noEmit`** at the repo root. Every caller of `config.url('api', ...)`, `config.dns('api', ...)`, `config.env('api', ...)` will be a compile error. There may be dozens. **This is the point.**

3. **For each compile error**, change the string literal `'api'` to `'core-api'`. Do not use a regex find/replace blindly — verify each call site is the renamed app, not a different `'api'` string.

4. **Run `tsops plan --namespace <ns>`** — expect:
   - `Delete: Deployment/<project>-api`, `Service/<project>-api`, etc.
   - `Create: Deployment/<project>-core-api`, `Service/<project>-core-api`, etc.

5. **The plan diff is the audit.** If it shows extra or missing changes, stop and read the config again.

6. **Run `tsops deploy --namespace <ns>`**. Old resources are pruned, new resources are created. Brief downtime is expected — the rename is treated as delete + create, not as a rolling update.

## What about cross-namespace callers?

If another tsops project consumes `config.url('api', ...)` from this config (rare; usually each project has its own config), that project's compile will also break and its config must be updated independently.

## Common mistakes

- **Forgetting to update CI scripts that hard-code the app name.** `kubectl logs deploy/myproject-api` will silently break. Search the repo for the old name across all file types, not just `.ts`.
- **Renaming the app key but not updating its `build.context`.** The Dockerfile path is independent of the app name; if you rename the directory too, update both.
- **Trying to do this without running `tsc --noEmit`.** The compiler is the rename audit. Skipping it means relying on runtime errors, which defeats the purpose of using tsops.
