FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY frontend/conduit/package.json frontend/conduit/package-lock.json ./frontend/conduit/
RUN npm ci --prefix frontend/conduit
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3001
ENV CONDUIT_EXPOSE=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
WORKDIR /app/frontend/conduit
COPY frontend/conduit/package.json ./package.json
COPY --from=build /app/frontend/conduit/server ./server
COPY --from=build /app/frontend/conduit/dist ./dist
RUN addgroup -S conduit && adduser -S conduit -G conduit \
  && mkdir -p data \
  && chown -R conduit:conduit data

USER conduit
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["npm", "start"]
