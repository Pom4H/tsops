# Type System Tests

Система тестирования типов для Dynamic Infrastructure DSL.

## Подход

Каждый тест — это отдельный TypeScript файл, который компилируется через `tsc`. 
Vitest запускает компилятор и проверяет exitCode.

## Категории тестов

### ✅ Valid Cases (valid-*.ts)

Файлы, которые **должны компилироваться без ошибок**.

- `valid-basic-config.ts` - Базовая валидная конфигурация
- `valid-service-dependencies.ts` - Сервисы с зависимостями
- `valid-helper-syntax.ts` - Использование $ helper
- `valid-template-syntax.ts` - Template syntax (@namespace/subdomain)
- `valid-multi-region.ts` - Multi-region setup
- `valid-complex-dependencies.ts` - Сложный граф зависимостей
- `valid-ingress-config.ts` - Ingress с разными TLS политиками

### ❌ Invalid Cases (invalid-*.ts)

Файлы, которые **должны НЕ компилироваться** (exitCode ≠ 0).

- `invalid-unknown-namespace.ts` - Ссылка на несуществующий namespace
- `invalid-unknown-region.ts` - Ссылка на несуществующий region
- `invalid-cluster-namespace.ts` - Cluster с несуществующим namespace
- `invalid-missing-required-fields.ts` - Отсутствуют обязательные поля

### 🔍 Inference Tests (inference-*.ts)

Проверка корректности вывода типов.

- `inference-host-generation.ts` - Генерация хостов из namespace + subdomain
- `inference-helper-types.ts` - Типы $ helper
- `inference-env-types.ts` - Структура EnvSpec

## Запуск тестов

```bash
# Все тесты
pnpm test

# Только type tests
pnpm test:types

# Watch mode
pnpm test:watch
```

## Как работает

1. **Runner** (`runner.test.ts`):
   - Сканирует директорию на наличие тестовых файлов
   - Группирует по префиксу (valid-, invalid-, inference-)
   - Запускает `tsc --noEmit --strict` для каждого файла
   - Проверяет exitCode

2. **Valid tests** (exitCode = 0):
   ```typescript
   const config = smart({ ... })
   // ✅ Должен скомпилироваться
   ```

3. **Invalid tests** (exitCode ≠ 0):
   ```typescript
   const config = smart({
     namespaces: {
       prod: { region: 'unknown' }  // ❌ Ошибка компиляции
     }
   })
   ```

4. **Inference tests** (exitCode = 0 + type checks):
   ```typescript
   const resolved = resolve(config)
   type _Check = typeof resolved.services.api.public
   // ✅ Типы выводятся корректно
   ```

## Добавление новых тестов

### Valid test

```typescript
// valid-my-feature.ts
import { smart, fqdn } from '../../index.js'

const config = smart({
  // ... your valid config
})
```

### Invalid test

```typescript
// invalid-my-error.ts
import { smart, fqdn } from '../../index.js'

const config = smart({
  // ... config that should cause type error
})
```

### Inference test

```typescript
// inference-my-type.ts
import { smart, resolve } from '../../index.js'

const config = smart({ ... })
const resolved = resolve(config)

// Type assertions
type _Check = typeof resolved.someField
const _verify: ExpectedType = actualValue
```

## Примеры ошибок

### Type Error - Unknown Namespace
```
error TS2322: Type '"staging"' is not assignable to type '"prod"'.
```

### Type Error - Unknown Region
```
error TS2322: Type '"eu"' is not assignable to type '"us"'.
```

### Type Error - Missing Required Field
```
error TS2741: Property 'project' is missing in type '{ ... }'.
```

## CI/CD

Tests запускаются автоматически:
- На каждом коммите
- В pull requests
- Перед релизом

## Performance

- Каждый тест запускается в отдельном процессе `tsc`
- Timeout: 30 секунд на тест
- Parallel execution через vitest

## Best Practices

1. **One concept per file** - каждый файл тестирует одну концепцию
2. **Clear naming** - имя файла описывает что тестируется
3. **Comments** - объясняйте почему тест должен пройти/упасть
4. **Minimal config** - минимальный пример для демонстрации
5. **Type assertions** - используйте для проверки inference

## Метрики

Current coverage:
- ✅ Valid cases: 7 tests
- ❌ Invalid cases: 4 tests
- 🔍 Inference: 3 tests
- **Total: 14 type tests**

Target coverage:
- [ ] All branded types (FQDN, Path, Port, etc.)
- [ ] Smart service syntax variations
- [ ] Circular dependency detection
- [ ] Host uniqueness validation
- [ ] TLS policy validation
- [ ] Environment variable policies
- [ ] Multi-region edge cases
- [ ] Helper function variations
