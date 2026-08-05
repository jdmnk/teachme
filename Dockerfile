FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY web web
RUN npm run build --workspace=web

FROM node:22-alpine
RUN addgroup -S app && adduser -S app -G app && mkdir /data && chown app:app /data
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
# tsx is the runtime (no server build step)
RUN npm ci --workspace=server && npm cache clean --force
COPY server server
COPY --from=build /app/web/dist web/dist
USER app
ENV WEB_DIST=/app/web/dist
ENV DATA_DIR=/data
ENV HOST=0.0.0.0
EXPOSE 3200
CMD ["npx", "tsx", "server/src/index.ts"]
