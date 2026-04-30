# RFC 0001 — Preview Namespaces

**Status:** Draft
**Author:** Roman Popov
**Created:** 2026-04-30
**Target version:** tsops 2.0 (major bump)

---

## Мотивация

В современной разработке быстрая обратная связь по PR — главный рычаг производительности команды. Сейчас в tsops каждое окружение объявлено статично в конфиге: `dev`, `docker`, `ru-stage`, `ru-prod`. Это работает для долгоживущих окружений, но **не подходит для эфемерных preview-окружений на каждый pull request**.

Без preview-окружений PR-ревью идёт на скриншотах и в голове ревьюера. Это медленно, не ловит UX-регрессии, и не даёт безопасно тестировать миграции БД, изменения в инфраструктуре или интеграции с внешними системами.

С preview-окружением:

- ревьюер открывает `https://pr-123.stage.example.com` и видит реальное приложение со всеми изменениями PR
- автоматический smoke-тест прогоняется в окружении максимально близком к prod
- агенты (Claude Code Action и аналоги) могут наблюдать за тем, как их PR ведёт себя в живом кластере, и вносить корректировки до того как ревьюер откроет PR

Tooling вроде Vercel, Netlify, Render решает это «из коробки» для своих managed-платформ. Команды на собственном Kubernetes собирают это руками — Argo CD ApplicationSet, Helm umbrella charts, кастомные kustomize overlay'и. Все эти подходы дублируют то, что tsops уже делает (типизированная генерация манифестов), и проигрывают в DX.

**Цель этой работы — сделать preview-окружения первоклассной частью tsops, чтобы за командой остался только один инструмент для всего deploy lifecycle.**

---

## Проблема

Сейчас в tsops:

1. **Namespaces статичны.** Map `namespaces: { ru-stage: {...} }` нельзя расширить runtime-параметром. Чтобы задеплоить «pr-123», пришлось бы вручную добавить запись в конфиг и закоммитить — по PR на каждый PR.

2. **Нет fallback на base namespace.** Если в PR изменился только `worken-front`, нужно пере-деплоить только его. Остальные сервисы (`worken-api`, `integrations-api`, ...) должны прозрачно перенаправляться в эталонный staging-base через `Service: ExternalName`. Tsops такого паттерна не знает.

3. **Image tags не параметризуются по PR.** Стратегии `git-sha`, `git-tag`, `timestamp` не дают `pr-${N}-${shortSha}` — самого читаемого формата для preview.

4. **Нет lifecycle-хуков.** На preview-namespace нужно: создать схему БД и прогнать миграции до старта подов, выпустить TLS-сертификат (если nested-домен), почистить схему/cert на cleanup. Сейчас это всё нужно делать сторонними скриптами.

5. **Нет команды `down`.** Удаление namespace — это `kubectl delete ns`, что обходит tsops. Если по пути есть DB-схема, она остаётся.

---

## Цели и не-цели

### Цели

- Объявить **overlay namespace** в конфиге — namespace-шаблон, который наследует базовый и параметризуется на лету
- Поддержать **runtime-переменные** (`pr`, `branch`, `sha`, любые другие через `--vars`) в naming, domain, env-функциях
- Поддержать **частичный деплой** — указать `--include worken-front,worken-api`, остальные апсы прозрачно станут `ExternalName` на base namespace
- Поддержать **два режима TLS** для nested-доменов:
  - **shared** — переиспользовать существующий wildcard-cert на base домене
  - **per-namespace** — выпустить свежий wildcard-cert через certbot DNS-01 hook
- Поддержать **schema-per-overlay** для PostgreSQL — создать схему до деплоя, удалить на cleanup, прогнать миграции
- Добавить CLI-команды `tsops up <ns>` и `tsops down <ns>`

### Не-цели

- Не строить собственный CI — agentic-loop живёт в GitHub Actions / любом другом CI, tsops остаётся CLI-инструментом
- Не поддерживать БД кроме PostgreSQL на этом этапе (MySQL/Mongo — позже)
- Не строить branch-based DB как у Neon/Supabase — оставляем на провайдеров
- Не выходить за рамки k8s-нативных примитивов (`Service: ExternalName` вместо service mesh)
- Не оптимизировать «один cert на все PR» через DNS-проксирование — слишком хрупко

---

## Решение (краткое описание)

Вводится новая форма `NamespaceDefinition` — **overlay**. Overlay — это namespace, который:

1. Наследует от другого namespace (`extends`)
2. Резолвит своё имя и домен из runtime-переменных
3. По умолчанию деплоит апсы из `--include`, остальные превращаются в `ExternalName` на base
4. Опционально выпускает свой TLS-cert и создаёт изолированную DB-схему

Пример конфига:

```ts
namespaces: {
  'ru-stage': {
    domain: 'stage.example.com',
    secretName: 'stage',
    region: 'ru',
  },
  preview: {
    extends: 'ru-stage',
    naming: ({ pr }) => `pr-${pr}`,
    domain: ({ pr }) => `pr-${pr}.stage.example.com`,
    fallback: 'ru-stage',
    cert: { mode: 'wildcard-shared', secretName: 'stage-wildcard-tls' },
    database: {
      urlSecret: { name: 'stage', key: 'DATABASE_URL' },
      schema: ({ pr }) => `pr_${pr}`,
      preDeploy: 'create-and-migrate',
      postDestroy: 'drop-schema',
    },
  },
}
```

CLI:

```bash
# Поднять preview для PR #123, билдить только изменённые apps
tsops up preview \
  --vars 'pr=123,branch=feature-x,sha=abc123' \
  --apps-from-changes

# Снести preview (удаляет namespace + DB-схему)
tsops down preview --vars 'pr=123'
```

Конкретный URL preview-окружения — `https://pr-123.stage.example.com`. Все апсы доступны на одном поддомене (Traefik IngressRoute). Те, что не в `--include`, прозрачно проксируются в `ru-stage`.

---

## Спецификация API

### Types (`packages/core/src/types.ts`)

```ts
export type StaticNamespaceDefinition = {
  /** Existing static namespace shape */
} & Record<string, unknown>

export type OverlayNamespaceDefinition<
  TBase extends string = string,
  TVars extends Record<string, string> = Record<string, string>
> = {
  /** Inherits all metadata from base namespace */
  extends: TBase

  /** Namespace name template — receives runtime --vars */
  naming: (vars: TVars) => string

  /** Domain template */
  domain: (vars: TVars) => string

  /** Apps NOT in --include get ExternalName Service to fallback namespace */
  fallback: TBase

  /** TLS certificate strategy */
  cert?:
    | {
        mode: 'wildcard-shared'
        /** Secret in fallback namespace holding the cert (will be referenced by IngressRoute) */
        secretName: string
      }
    | {
        mode: 'per-namespace'
        /** Issue cert via certbot DNS-01 job before main deploy */
        issuer: {
          email: string
          dnsProvider: 'cloudru' | 'cloudflare' | 'route53'
          credentialsSecret: string
        }
      }

  /** Database schema-per-overlay (PostgreSQL only) */
  database?: {
    urlSecret: { name: string; key: string }
    schema: (vars: TVars) => string
    preDeploy: 'create-schema' | 'create-and-migrate' | CustomJobConfig
    postDestroy: 'drop-schema'
    /** Optional: extra env injected into all apps in overlay namespace */
    appEnvOverride?: (vars: TVars, baseUrl: string, schema: string) => Record<string, string>
  }
} & Record<string, unknown>

export type NamespaceDefinition = StaticNamespaceDefinition | OverlayNamespaceDefinition

export function isOverlayNamespace(ns: NamespaceDefinition): ns is OverlayNamespaceDefinition {
  return 'extends' in ns && 'naming' in ns
}
```

### CLI (`packages/cli/src/cli.ts`)

```bash
tsops up <namespace> [options]

Options:
  --vars '<key=value,...>'        Runtime parameters for overlay namespaces
  --include <app1,app2,...>       Apps to deploy fully (others become ExternalName)
  --apps-from-changes             Auto-detect apps from `git diff <base>`
  --base-ref <ref>                Git ref for diff (default: origin/main)
  --dry-run                       Show plan without applying
  --skip-cert                     Skip cert hook (for development)
  --skip-database                 Skip DB hook

tsops down <namespace> [options]

Options:
  --vars '<key=value,...>'        Required for overlay namespaces
  --keep-database                 Skip postDestroy hook (preserve schema)
  --dry-run
```

### Resolver (`packages/core/src/config/namespaces.ts`)

`select(target, vars?)`:
- Если `target` — ключ static namespace: вернуть `[target]` (как сейчас)
- Если `target` — ключ overlay namespace: вызвать `naming(vars)` и вернуть resolved name. Throw если `vars` не передан.

`createHostContext(namespace, options)`:
- Если namespace — overlay (по факту его `extends`): сначала загрузить base metadata, наложить runtime-resolved fields (`domain`), спредить `vars` в context
- Apps' env-функции теперь видят `ctx.pr`, `ctx.branch`, `ctx.sha`

### Deployer (`packages/core/src/operations/deployer.ts`)

Новый flow в `deploy({ namespace, vars, include })`:

1. Resolve namespace — static name или `naming(vars)` для overlay
2. Если overlay + `cert.mode === 'per-namespace'`: запустить certbot Job, дождаться появления TLS secret
3. Если overlay + `database`: запустить migrate Job (`CREATE SCHEMA` + `prisma migrate deploy` или custom command)
4. Build plan для apps (как сейчас)
5. Для каждого app:
   - Если в `include` (или overlay не задан): обычный Deployment+Service+Ingress
   - Иначе если overlay + `fallback`: ExternalName Service на `<svc>.<fallback>.svc.cluster.local`, IngressRoute смотрит на этот ExternalName Service
6. Apply manifests

Новый метод `down({ namespace, vars })`:

1. Resolve namespace
2. Если `database.postDestroy === 'drop-schema'`: запустить cleanup Job (`DROP SCHEMA ... CASCADE`)
3. `kubectl delete namespace <resolved>`

### Builder

`buildExternalNameService(appName, fallbackNamespace, ports)` — новая утилита в `packages/k8`.

---

## Backwards compatibility

- Все существующие конфиги работают без изменений: новая форма namespace — discriminated union, старая static-форма не меняет shape
- `select()` без `vars` пропускает overlay namespaces (они не появляются в default deploy)
- Static-namespace конфиги, которые не используют overlays, не получают runtime-cost от новой логики

**Major version bump tsops 1.x → 2.0** обоснован тем, что:
- Тип `NamespaceDefinition` стал union'ом — пользователи с явными type annotations должны обновить их
- Новые обязательные поля в overlay (`extends`, `naming`, `domain`, `fallback`)
- Новые CLI-команды добавлены, но никакие существующие не сломаны

---

## План работы

8 чанков, каждый — отдельный коммит с changeset:

| # | Чанк | Files | LOC | PR-коммит |
|---|------|-------|-----|-----------|
| 1 | Types: overlay namespace shape, type guards | `core/src/types.ts` | ~80 | `feat(core): add OverlayNamespaceDefinition type` |
| 2 | Resolver: parse extends/naming/domain, runtime vars | `core/src/config/namespaces.ts`, tests | ~200 | `feat(core): resolve overlay namespaces with runtime vars` |
| 3 | Apps: shouldUseFallback, ExternalName plan entry | `core/src/config/apps.ts`, `core/src/operations/types.ts`, `k8` | ~150 | `feat(core): cross-namespace fallback via ExternalName` |
| 4 | Deployer: integrate overlay + fallback in deploy/down flow | `core/src/operations/deployer.ts` | ~120 | `feat(core): wire overlay deploy/down into Deployer` |
| 5 | Cert hook (per-namespace certbot DNS-01) | `core/src/operations/cert-hook.ts` (new) | ~150 | `feat(core): per-namespace TLS cert via certbot hook` |
| 6 | DB hook (create/drop schema, migrate job) | `core/src/operations/db-hook.ts` (new) | ~120 | `feat(core): schema-per-overlay database lifecycle` |
| 7 | CLI: up/down with --vars, --include, --apps-from-changes | `cli/src/cli.ts`, `cli/src/commands/{up,down}.ts` (new) | ~150 | `feat(cli): up/down commands for overlay namespaces` |
| 8 | Tests, docs, examples, changeset | `tests/`, `docs/`, `examples/`, `.changeset/` | ~300 | `docs: preview namespaces RFC + examples + tests` |

**Итого ~1270 LOC. Оценка: 1.5–2 рабочих дня full-focus, 4–5 дней с прерываниями.**

Каждый чанк проходит:
- `pnpm build` (turbo)
- `pnpm test`
- `pnpm lint`
- Type-tests на `tsd` (если применимо)

---

## Открытые вопросы

1. **CLI флаги для vars**: comma-separated `--vars 'pr=123,branch=feature-x'` vs JSON `--vars '{"pr":"123"}'` vs повторяемый `--var pr=123 --var branch=feature-x`? Лично за **повторяемый `--var`** — лучшая совместимость с shell escape rules.

2. **Где живут certbot/migrate jobs**: внутри overlay namespace (живут до cleanup) или в `kube-system` с уникальным именем? **За первое** — namespace удаляется → jobs автоматически.

3. **Защита от конкурентного `up` на тот же overlay**: если два разработчика одновременно запустят `tsops up preview --vars pr=123`? **Lock через annotation на namespace** (`tsops/locked-by: <hostname>`).

4. **Как считать «changed apps»**: `turbo run build --filter='...[base]' --dry-run=json` (нативно) vs парсить `git diff --name-only` против списка app-paths (быстрее, не зависит от turbo). **За turbo** — пользователи tsops уже пишут turborepo конфиги, паттерн знакомый.

5. **DB-миграции по умолчанию**: запускать или нет? Если PR не трогает schema, миграция — no-op, безопасно. Если трогает — нужен изолированный schema (мы его и создаём). **Запускать по умолчанию, опт-аут `--skip-database`**.
