# syntax=docker/dockerfile:1
FROM node:20-alpine
WORKDIR /app
RUN cat <<'APP' > server.mjs
import http from 'http';

const port = Number(process.env.PORT ?? 8080);

const requestHandler = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
  });
  res.end(
    JSON.stringify({
      service: 'backend',
      message: 'Hello from the backend container',
      url: req.url,
    }),
  );
};

const server = http.createServer(requestHandler);

server.listen(port, () => {
  console.log(`[backend] listening on ${port}`);
});
APP

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.mjs"]
