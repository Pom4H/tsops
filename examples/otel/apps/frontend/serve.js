// Initialize OpenTelemetry FIRST (must be before any other imports)
require('./otel');

const { Hono } = require('hono');
const { serve } = require('@hono/node-server');
const { serveStatic } = require('@hono/node-server/serve-static');
const { readFileSync } = require('fs');
const { join } = require('path');

const app = new Hono();
const PORT = process.env.PORT || 3000;

// ===== Metrics (simple in-memory) =====
let totalRequests = 0;
let requestsByPath = {};
const startTime = Date.now();

// ===== Structured Logging =====
function log(level, message, metadata = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'worken-frontend',
    ...metadata
  };
  console.log(JSON.stringify(logEntry));
}

// ===== Middleware =====

// Request logging and metrics
app.use('*', async (c, next) => {
  const start = Date.now();
  const path = c.req.path;
  
  totalRequests++;
  requestsByPath[path] = (requestsByPath[path] || 0) + 1;
  
  await next();
  
  const duration = Date.now() - start;
  
  log('info', 'HTTP Request', {
    method: c.req.method,
    path: path,
    status: c.res.status,
    duration: `${duration}ms`,
    userAgent: c.req.header('user-agent')
  });
});

// ===== Routes =====

// Metrics endpoint (Prometheus format)
app.get('/metrics', (c) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  let metrics = `# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total ${totalRequests}

# HELP process_uptime_seconds Process uptime in seconds
# TYPE process_uptime_seconds gauge
process_uptime_seconds ${uptime}

`;

  // Add per-path metrics
  for (const [path, count] of Object.entries(requestsByPath)) {
    metrics += `# HELP http_requests_by_path_total Requests by path
# TYPE http_requests_by_path_total counter
http_requests_by_path_total{path="${path}"} ${count}

`;
  }
  
  return c.text(metrics, 200, {
    'Content-Type': 'text/plain; version=0.0.4'
  });
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    requests: totalRequests
  });
});

// Serve index.html
app.get('/', (c) => {
  try {
    const html = readFileSync(join(__dirname, 'index.html'), 'utf-8');
    return c.html(html);
  } catch (error) {
    log('error', 'Error reading index.html', { error: error.message });
    return c.text('Error loading page', 500);
  }
});

// Serve static files
app.use('/static/*', serveStatic({ root: './' }));

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
    endpoints: {
      health: '/health',
      metrics: '/metrics',
      root: '/'
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
