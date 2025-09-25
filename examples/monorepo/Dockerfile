# syntax=docker/dockerfile:1.7-labs
ARG NODE_VERSION=20
ARG PACKAGE_NAME
ARG SERVICE_DIR

FROM node:${NODE_VERSION}-slim AS base
ARG PACKAGE_NAME
ARG SERVICE_DIR
WORKDIR /repo
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@8.15.4 --activate
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
RUN pnpm install --frozen-lockfile=false
RUN pnpm turbo run build --filter=${PACKAGE_NAME}

FROM node:${NODE_VERSION}-slim AS runtime
ARG SERVICE_DIR
ARG PACKAGE_NAME
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /repo/${SERVICE_DIR}/dist ./dist
COPY --from=base /repo/${SERVICE_DIR}/package.json ./package.json
CMD ["node", "dist/index.js"]
