FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY web web
RUN npm run build --workspace=web

FROM node:22-slim
# slim (glibc), not alpine: the optional agent-CLI engines (codex, claude)
# are native binaries that don't run on musl. runs as the stock `node` user
# (uid 1000, matches a typical host user) so optionally bind-mounted CLI
# homes (CODEX_HOME, CLAUDE_CONFIG_DIR) stay writable for session state
RUN mkdir /data && chown node:node /data
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
# tsx is the runtime (no server build step)
RUN npm ci --workspace=server && npm cache clean --force
COPY server server
COPY --from=build /app/web/dist web/dist
USER node
ENV WEB_DIST=/app/web/dist
ENV DATA_DIR=/data
ENV HOST=0.0.0.0
EXPOSE 3200
CMD ["npx", "tsx", "server/src/index.ts"]
