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
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
RUN pnpm install --frozen-lockfile=false
RUN pnpm turbo run build --filter=${PACKAGE_NAME}

FROM node:${NODE_VERSION}-slim AS runtime
ARG SERVICE_DIR
ARG PACKAGE_NAME
WORKDIR /app
ENV NODE_ENV=production
# Prepare pnpm in runtime
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

# Copy workspace files for Turbo to resolve filters
COPY --from=base /repo/package.json ./package.json
COPY --from=base /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=base /repo/turbo.json ./turbo.json
COPY --from=base /repo/apps ./apps

# Also copy built dist for the target service (start script may use it)
COPY --from=base /repo/${SERVICE_DIR}/dist ./apps/${SERVICE_DIR}/dist

CMD ["pnpm", "turbo", "run", "start", "--filter=${PACKAGE_NAME}"]
