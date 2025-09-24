import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();

app.get('/', (c) =>
  c.json({
    ok: true,
    endpoints: ['/api/healthz', '/api/message'],
  }),
);

app.get('/api/healthz', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.get('/api/message', (c) => {
  const hostname = process.env.HOSTNAME ?? 'unknown-host';
  const frontendHint = process.env.FRONTEND_URL ?? 'not-set';

  return c.json({
    message: `Hello from Hono on ${hostname}!`,
    frontendHint,
    servedAt: new Date().toISOString(),
  });
});

const port = Number.parseInt(process.env.PORT ?? '8080', 10);

console.log(`[backend] starting on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
