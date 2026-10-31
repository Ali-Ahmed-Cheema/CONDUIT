FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/ ./packages/
RUN corepack pnpm install --frozen-lockfile
COPY . .
RUN corepack pnpm build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3001
ENV CONDUIT_EXPOSE=1
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY --from=build /app/packages/ ./packages/
RUN corepack pnpm install --filter "@conduit/web..." --prod --frozen-lockfile
COPY --from=build /app/apps/web/server ./apps/web/server
COPY --from=build /app/apps/web/scripts ./apps/web/scripts
COPY --from=build /app/apps/web/dist ./apps/web/dist
RUN addgroup -S conduit && adduser -S conduit -G conduit \
  && mkdir -p /app/frontend/conduit/data \
  && chown -R conduit:conduit /app/frontend/conduit/data

USER conduit
WORKDIR /app/apps/web
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["corepack", "pnpm", "start"]
