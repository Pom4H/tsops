# Runtime Config API

Runtime Config API позволяет получать вычисленные значения переменных окружения и эндпойнтов из `tsops.config.ts` с полной типобезопасностью.

## Основная идея

Вместо дублирования логики получения переменных окружения в отдельном файле (`envs.ts`), используйте `tsops.config.ts` как единственный источник правды. Config автоматически резолвит все значения для текущего namespace.

## Простое использование

```typescript
import config from './tsops.config'

// Internal endpoint (Kubernetes DNS)
const apiUrl = config.getInternalEndpoint('worken-api')
// => 'http://worken-worken-api.dev.svc.cluster.local:3000'

// External endpoint (public URL)
const frontUrl = config.getExternalEndpoint('worken-front')
// => 'https://worken.localtest.me'

// Environment variables
const env = config.getEnv('worken-api')
console.log(env.DATABASE_URL)

// Full app info
const app = config.getApp('worken-api')
```
