// Initialize OpenTelemetry FIRST (must be before any other imports)
require('./otel');

const { Hono } = require('hono');
const { serve } = require('@hono/node-server');
const { cors } = require('hono/cors');
const promClient = require('prom-client');

const app = new Hono();
const PORT = process.env.PORT || 3000;

// ===== Prometheus Metrics Setup =====
const register = new promClient.Registry();

// Default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5]
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status']
});

const httpRequestsInProgress = new promClient.Gauge({
  name: 'http_requests_in_progress',
  help: 'Number of HTTP requests currently being processed'
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(httpRequestsInProgress);

// ===== Structured Logging =====
function log(level, message, metadata = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'worken-api',
    ...metadata
  };
  console.log(JSON.stringify(logEntry));
}

// ===== Middleware =====

// CORS
app.use('*', cors());

// Request logging and metrics middleware
app.use('*', async (c, next) => {
  const start = Date.now();
  httpRequestsInProgress.inc();
  
  await next();
  
  const duration = (Date.now() - start) / 1000;
  const route = c.req.routePath || c.req.path;
  
  httpRequestDuration.labels(c.req.method, route, c.res.status).observe(duration);
  httpRequestTotal.labels(c.req.method, route, c.res.status).inc();
  httpRequestsInProgress.dec();
  
  log('info', 'HTTP Request', {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration: `${duration.toFixed(3)}s`,
    userAgent: c.req.header('user-agent')
  });
});

// ===== Routes =====

// Prometheus metrics endpoint
app.get('/metrics', async (c) => {
  const metrics = await register.metrics();
  return c.text(metrics, 200, {
    'Content-Type': register.contentType
  });
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API status endpoint
app.get('/api/status', (c) => {
  const secrets = {
    hasJWT: !!process.env.JWT_SECRET,
    hasDB: !!process.env.DB_PASSWORD,
    hasAPIKey: !!process.env.API_KEY
  };

  return c.json({
    status: 'ok',
    service: 'worken-api',
    framework: 'hono',
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    hostname: require('os').hostname(),
    secrets,
    deployment: {
      tool: 'tsops',
      namespace: process.env.NAMESPACE || 'unknown',
      cluster: process.env.CLUSTER || 'unknown'
    }
  });
});

// Echo endpoint - returns request info
app.post('/api/echo', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  
  return c.json({
    message: 'Echo response',
    receivedBody: body,
    headers: Object.fromEntries(c.req.raw.headers.entries()),
    timestamp: new Date().toISOString()
  });
});

// Environment info (sanitized)
app.get('/api/info', (c) => {
  return c.json({
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    memory: {
      total: Math.round(require('os').totalmem() / 1024 / 1024) + ' MB',
      free: Math.round(require('os').freemem() / 1024 / 1024) + ' MB'
    },
    cpus: require('os').cpus().length,
    hostname: require('os').hostname()
  });
});

// Test endpoint with optional delay parameter
app.get('/api/test/:delay?', async (c) => {
  const delayParam = c.req.param('delay');
  const delay = parseInt(delayParam) || 0;
  
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  return c.json({
    message: 'Test endpoint',
    delay: delay + 'ms',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint without delay parameter (for compatibility)
app.get('/api/test', async (c) => {
  return c.json({
    message: 'Test endpoint',
    delay: '0ms',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    path: c.req.path,
    timestamp: new Date().toISOString()
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString()
  }, 500);
});

// ===== Start Server =====
const server = serve({
  fetch: app.fetch,
  port: PORT,
  hostname: '0.0.0.0'
}, (info) => {
  log('info', 'Server started', {
    port: info.port,
    address: info.address,
    framework: 'hono',
    environment: process.env.NODE_ENV || 'development',
    namespace: process.env.NAMESPACE,
    cluster: process.env.CLUSTER,
    endpoints: {
      health: '/health',
      metrics: '/metrics',
      status: '/api/status'
    }
  });
});

// Graceful shutdown
const shutdown = () => {
  log('info', 'Shutdown signal received, closing server gracefully');
  server.close(() => {
    log('info', 'Server closed');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    log('error', 'Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
