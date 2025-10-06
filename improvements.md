Давайте изучу текущую реализацию CLI, чтобы дать конкретные рекомендации по улучшению DX.

[7 tools called]

Отлично! Изучив вашу CLI, я вижу, что уже проделана большая работа (Commander, валидация, хороший вывод). Вот **конкретные рекомендации по улучшению DX** с приоритетами:

## 🎯 Приоритетные улучшения DX

### 1. **Interactive Mode & Wizard** 🧙‍♂️ (HIGH IMPACT)

**Проблема:** Новые пользователи не знают, с чего начать.

```bash
# Вместо этого:
tsops --help  # читай документацию...

# Сделать:
tsops init    # интерактивный wizard
```

**Реализация:**

```typescript
program
  .command('init')
  .description('Interactive setup wizard for tsops config')
  .option('--template <name>', 'Use predefined template (simple, monorepo, fullstack)')
  .action(async (options) => {
    const inquirer = await import('inquirer')

    const answers = await inquirer.default.prompt([
      {
        type: 'input',
        name: 'project',
        message: 'Project name:',
        default: path.basename(process.cwd())
      },
      {
        type: 'input',
        name: 'registry',
        message: 'Docker registry:',
        default: 'ghcr.io/your-org'
      },
      {
        type: 'list',
        name: 'tagStrategy',
        message: 'Image tag strategy:',
        choices: ['git-sha', 'git-tag', 'timestamp']
      }
      // ... больше вопросов
    ])

    // Генерируем tsops.config.ts из шаблона
    const config = generateConfig(answers)
    fs.writeFileSync('tsops.config.ts', config)

    console.log('✅ Created tsops.config.ts')
    console.log('\nNext steps:')
    console.log('  1. tsops plan')
    console.log('  2. tsops build')
    console.log('  3. tsops deploy')
  })
```

---

### 2. **Watch Mode** 👀 (HIGH IMPACT)

**Проблема:** Нужно постоянно перезапускать команды при разработке.

```bash
tsops watch --namespace dev
# Автоматически пересобирает и деплоит при изменении config/code
```

**Реализация:**

```typescript
program
  .command('watch')
  .description('Watch for changes and auto-deploy')
  .option('-n, --namespace <name>', 'target namespace')
  .option('--app <name>', 'target app')
  .action(async (options) => {
    const chokidar = await import('chokidar')

    console.log('👀 Watching for changes...\n')

    const watcher = chokidar.watch(['tsops.config.ts', 'src/**/*', 'apps/**/*'], {
      ignored: /node_modules|dist/
    })

    let building = false

    watcher.on('change', async (path) => {
      if (building) return
      building = true

      console.log(`\n📝 ${path} changed`)
      try {
        const config = await loadConfig(options.config)
        const tsops = new TsOps(config)

        await tsops.build({ namespace: options.namespace, app: options.app })
        await tsops.deploy({ namespace: options.namespace, app: options.app })

        console.log('✅ Deployed successfully')
      } catch (error) {
        console.error('❌ Error:', error.message)
      } finally {
        building = false
      }
    })
  })
```

---

### 3. **Rich Diff Output** 📊 (MEDIUM IMPACT)

**Проблема:** Текущий diff output сложно читать.

**Улучшение:**

```typescript
// Установить: pnpm add diff chalk cli-table3

import { diffLines } from 'diff'
import chalk from 'chalk'
import Table from 'cli-table3'

function displayDiff(change: ChangeSet) {
  if (!change.diff) return

  console.log(chalk.bold(`\n   📝 Changes to ${change.kind}/${change.name}:`))

  const lines = diffLines(change.oldYaml || '', change.newYaml || '')

  for (const part of lines) {
    const color = part.added ? 'green' : part.removed ? 'red' : 'gray'
    const prefix = part.added ? '+' : part.removed ? '-' : ' '

    part.value.split('\n').forEach((line) => {
      if (line) console.log(chalk[color](`      ${prefix} ${line}`))
    })
  }
}

// Или табличный формат для метаданных:
const table = new Table({
  head: ['Resource', 'Action', 'Namespace'],
  style: { head: ['cyan'] }
})

for (const change of changes) {
  table.push([
    change.name,
    change.action === 'create' ? chalk.green('CREATE') : chalk.yellow('UPDATE'),
    change.namespace
  ])
}

console.log(table.toString())
```

---

### 4. **Config Validation Command** ✅ (HIGH IMPACT)

**Проблема:** Ошибки в конфиге обнаруживаются только при deploy.

```bash
tsops validate
# Проверяет конфиг БЕЗ подключения к кластеру
```

**Реализация:**

```typescript
program
  .command('validate')
  .description('Validate tsops config without connecting to cluster')
  .option('-c, --config <path>', 'path to config file', 'tsops.config')
  .action(async (options) => {
    const config = await loadConfig(options.config)

    console.log('🔍 Validating configuration...\n')

    const errors: string[] = []
    const warnings: string[] = []

    // Проверка обязательных полей
    if (!config.project) errors.push('Missing required field: project')
    if (!config.namespaces) errors.push('Missing required field: namespaces')
    if (!config.clusters) errors.push('Missing required field: clusters')

    // Проверка apps
    for (const [appName, app] of Object.entries(config.apps)) {
      if (!app.build && !app.image) {
        errors.push(`App "${appName}": must specify either build or image`)
      }

      if (app.network?.certificate && !app.host) {
        errors.push(`App "${appName}": certificate requires host to be set`)
      }

      // Проверка secrets refs
      if (typeof app.env === 'function') {
        warnings.push(`App "${appName}": env is a function, cannot validate secret refs statically`)
      }
    }

    // Проверка namespace-cluster mapping
    for (const [clusterName, cluster] of Object.entries(config.clusters)) {
      for (const ns of cluster.namespaces) {
        if (!config.namespaces[ns]) {
          errors.push(`Cluster "${clusterName}" references undefined namespace "${ns}"`)
        }
      }
    }

    // Вывод результатов
    if (errors.length > 0) {
      console.log(chalk.red.bold('❌ Validation Errors:\n'))
      errors.forEach((err) => console.log(`   • ${err}`))
      console.log()
    }

    if (warnings.length > 0) {
      console.log(chalk.yellow.bold('⚠️  Warnings:\n'))
      warnings.forEach((warn) => console.log(`   • ${warn}`))
      console.log()
    }

    if (errors.length === 0 && warnings.length === 0) {
      console.log(chalk.green('✅ Configuration is valid!'))
    } else if (errors.length === 0) {
      console.log(chalk.green('✅ Configuration is valid (with warnings)'))
    } else {
      process.exit(1)
    }
  })
```

---

### 5. **Status Command** 📊 (HIGH IMPACT)

**Проблема:** Нет способа быстро посмотреть текущее состояние деплоя.

```bash
tsops status
# Показывает что задеплоено в каждом namespace
```

**Реализация:**

```typescript
program
  .command('status')
  .description('Show current deployment status across namespaces')
  .option('-n, --namespace <name>', 'filter by namespace')
  .option('--watch', 'watch for changes in real-time')
  .action(async (options) => {
    const config = await loadConfig(options.config)
    const tsops = new TsOps(config)

    const plan = await tsops.plan({ namespace: options.namespace })

    const table = new Table({
      head: ['Namespace', 'App', 'Image', 'Status', 'Replicas'],
      style: { head: ['cyan'] }
    })

    for (const entry of plan.entries) {
      // Проверяем реальный статус в кластере через kubectl
      const deployment = await kubectl.get('deployment', entry.app, entry.namespace)

      const status =
        deployment.status.availableReplicas === deployment.spec.replicas
          ? chalk.green('✓ Running')
          : chalk.yellow('⚠ Pending')

      const replicas = `${deployment.status.availableReplicas}/${deployment.spec.replicas}`

      table.push([
        entry.namespace,
        entry.app,
        entry.image.split(':')[1].substring(0, 7), // short sha
        status,
        replicas
      ])
    }

    console.log(table.toString())

    if (options.watch) {
      setInterval(async () => {
        // обновить таблицу
      }, 5000)
    }
  })
```

---

### 6. **Better Progress Indicators** ⏳ (MEDIUM IMPACT)

**Проблема:** Нет feedback при долгих операциях.

```typescript
// Установить: pnpm add ora

import ora from 'ora'

async function buildWithProgress(app: string) {
  const spinner = ora(`Building ${app}...`).start()

  try {
    await dockerBuild(app)
    spinner.succeed(`Built ${app}`)
  } catch (error) {
    spinner.fail(`Failed to build ${app}`)
    throw error
  }
}

// Для множественных операций:
import cliProgress from 'cli-progress'

const progressBar = new cliProgress.SingleBar({
  format: 'Building |{bar}| {percentage}% | {app}',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591'
})

progressBar.start(apps.length, 0)

for (let i = 0; i < apps.length; i++) {
  progressBar.update(i + 1, { app: apps[i] })
  await buildApp(apps[i])
}

progressBar.stop()
```

---

### 7. **Context Switching** 🔄 (HIGH IMPACT)

**Проблема:** Нужно постоянно указывать `--namespace` и `--app`.

```bash
# Вместо:
tsops deploy --namespace prod --app api

# Сделать:
tsops use prod api
tsops deploy  # использует сохраненный контекст
```

**Реализация:**

```typescript
// Сохраняем в ~/.tsops/context.json
program
  .command('use')
  .description('Set default namespace and app')
  .argument('[namespace]', 'default namespace')
  .argument('[app]', 'default app')
  .action((namespace, app) => {
    const contextPath = path.join(os.homedir(), '.tsops', 'context.json')
    const context = { namespace, app, cwd: process.cwd() }

    fs.mkdirSync(path.dirname(contextPath), { recursive: true })
    fs.writeFileSync(contextPath, JSON.stringify(context, null, 2))

    console.log('✅ Context set:')
    if (namespace) console.log(`   Namespace: ${namespace}`)
    if (app) console.log(`   App: ${app}`)
  })

// В каждой команде читаем контекст:
function getContext() {
  const contextPath = path.join(os.homedir(), '.tsops', 'context.json')
  if (fs.existsSync(contextPath)) {
    const context = JSON.parse(fs.readFileSync(contextPath, 'utf-8'))
    if (context.cwd === process.cwd()) {
      return context
    }
  }
  return {}
}
```

---

### 8. **Logs Command** 📜 (HIGH IMPACT)

**Проблема:** Нужно вручную использовать kubectl для просмотра логов.

```bash
tsops logs api --namespace prod
tsops logs api -f  # follow
tsops logs api --tail 100
```

**Реализация:**

```typescript
program
  .command('logs <app>')
  .description('View logs for an app')
  .option('-n, --namespace <name>', 'target namespace')
  .option('-f, --follow', 'follow log output')
  .option('--tail <lines>', 'number of lines to show', '50')
  .option('--container <name>', 'specific container')
  .action(async (app, options) => {
    const config = await loadConfig(options.config)
    const context = getContext()
    const namespace = options.namespace || context.namespace

    const podName = await kubectl.getPodName(app, namespace)

    const args = ['logs', podName, '-n', namespace]
    if (options.follow) args.push('-f')
    if (options.tail) args.push('--tail', options.tail)
    if (options.container) args.push('-c', options.container)

    // Stream logs to console
    const child = spawn('kubectl', args, { stdio: 'inherit' })
  })
```

---

### 9. **Shell Completion** 🎯 (LOW EFFORT, HIGH IMPACT)

**Проблема:** Нужно помнить все команды и опции.

```bash
tsops completion bash > /etc/bash_completion.d/tsops
tsops completion zsh > ~/.zsh/completion/_tsops
```

**Реализация:** Commander поддерживает это из коробки:

```typescript
program
  .command('completion')
  .description('Generate shell completion script')
  .argument('<shell>', 'shell type (bash, zsh, fish)')
  .action((shell) => {
    // Commander автоматически генерирует completion
    console.log(program.createCompletion(shell))
  })
```

---

### 10. **Config Templates** 📋 (MEDIUM IMPACT)

```bash
tsops template list
tsops template show nextjs-k8s
tsops template apply nextjs-k8s
```

---

### 11. **Secrets Manager Integration** 🔐 (ENTERPRISE FEATURE)

```typescript
// В tsops.config.ts:
secrets: {
  'api-secrets': {
    DB_PASSWORD: await vault.get('prod/db-password'),
    JWT_SECRET: await vault.get('prod/jwt-secret')
  }
}
```

---

## 📦 Рекомендуемые библиотеки

```json
{
  "dependencies": {
    "ora": "^7.0.1", // Spinners
    "chalk": "^5.3.0", // Colors
    "cli-table3": "^0.6.3", // Tables
    "inquirer": "^9.2.12", // Interactive prompts
    "chokidar": "^3.5.3", // File watching
    "diff": "^5.1.0", // Better diffs
    "cli-progress": "^3.12.0" // Progress bars
  }
}
```

---

## 🎯 Приоритетный план внедрения

**Week 1:**

1. ✅ `tsops validate` - мгновенная ценность
2. ✅ `tsops use` - контекст switching
3. ✅ Better progress indicators

**Week 2:** 4. ✅ `tsops status` - visibility 5. ✅ `tsops logs` - debugging 6. ✅ Rich diff output

**Week 3:** 7. ✅ `tsops init` - onboarding 8. ✅ `tsops watch` - development workflow

**Week 4:** 9. ✅ Shell completion 10. ✅ Config templates

---

Хотите, чтобы я начал имплементацию одного из этих улучшений? Рекомендую начать с **`validate` и `use`** - они дадут максимальный эффект при минимальных усилиях! 🚀
