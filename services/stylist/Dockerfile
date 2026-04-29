# Multi-stage Dockerfile for the @mei/stylist Render service.
#
# Stage 1 (deps): install workspace dependencies for just this service +
# its workspace neighbours that it depends on (`@mei/types`).
# Stage 2 (runner): copy the resolved tree and exec tsx against src/index.ts.
#
# We don't pre-build TS; tsx runs it directly. That keeps the deploy fast
# and the container small. Render passes PORT via env (default 8080).

FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages packages
COPY services/stylist services/stylist
RUN pnpm install --frozen-lockfile --filter @mei/stylist...

FROM base AS runner
COPY --from=deps /app /app
WORKDIR /app/services/stylist
EXPOSE 8080
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
