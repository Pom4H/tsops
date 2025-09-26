# syntax=docker/dockerfile:1.7-labs
ARG NODE_VERSION=20
ARG PACKAGE_NAME=@monorepo/frontend
ARG SERVICE_DIR=apps/frontend
ARG NEXT_PUBLIC_WS_URL

FROM node:${NODE_VERSION}-slim AS base
ARG PACKAGE_NAME
ARG SERVICE_DIR
ARG NEXT_PUBLIC_WS_URL
WORKDIR /repo
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
RUN mkdir -p apps/frontend/public
RUN pnpm install --frozen-lockfile=false
# Ensure the WebSocket URL is embedded at build time for client bundles
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
RUN pnpm turbo run build --filter=${PACKAGE_NAME}

FROM node:${NODE_VERSION}-slim AS runtime
ARG SERVICE_DIR
ARG NEXT_PUBLIC_WS_URL
WORKDIR /app
ENV NODE_ENV=production
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

# Copy Next.js standalone if it exists; ignore errors if missing
RUN mkdir -p .next/static && mkdir -p public || true
COPY --from=base /repo/${SERVICE_DIR}/.next/standalone ./
COPY --from=base /repo/${SERVICE_DIR}/.next/static ./apps/frontend/.next/static

# Ensure public assets are placed alongside the app
COPY --from=base /repo/${SERVICE_DIR}/public ./apps/frontend/public
# Start Next.js standalone server from monorepo path
CMD ["node", "apps/frontend/server.js"]
