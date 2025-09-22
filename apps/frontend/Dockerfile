# syntax=docker/dockerfile:1
FROM node:20-alpine
WORKDIR /app
RUN cat <<'APP' > server.mjs
import http from 'http';

const port = Number(process.env.PORT ?? 3000);
const responseBody = JSON.stringify({
  service: 'frontend',
  message: 'Hello from the frontend container',
});

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
  });
  res.end(responseBody);
});

server.listen(port, () => {
  console.log(`[frontend] listening on ${port}`);
});
APP

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.mjs"]
