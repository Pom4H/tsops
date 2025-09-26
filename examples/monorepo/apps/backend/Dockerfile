# syntax=docker/dockerfile:1.7-labs
ARG NODE_VERSION=24
ARG PACKAGE_NAME=@monorepo/backend
ARG SERVICE_DIR=apps/backend

FROM node:${NODE_VERSION}-slim AS base
ARG PACKAGE_NAME
ARG SERVICE_DIR
WORKDIR /repo
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
RUN pnpm install --frozen-lockfile=false
RUN pnpm turbo run build --filter=${PACKAGE_NAME}

FROM node:${NODE_VERSION}-slim AS runtime
ARG SERVICE_DIR
WORKDIR /app
ENV NODE_ENV=production
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

# Install only the service runtime deps
COPY --from=base /repo/${SERVICE_DIR}/package.json ./package.json
RUN pnpm install --prod --frozen-lockfile=false

# Copy built artifacts
COPY --from=base /repo/${SERVICE_DIR}/dist ./dist

CMD ["node", "dist/index.js"]


