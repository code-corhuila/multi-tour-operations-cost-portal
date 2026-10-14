# Build stage: versions are pinned, never latest (Annex I).
FROM node:22.12-alpine3.21 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build \
 && cp dist/portal.css dist/operations-cost-portal.css

# Runtime stage: nginx serves the two files. The gateway routes /portals/operations-cost/ to this container.
FROM nginx:1.27.3-alpine3.20
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/portal.js /app/dist/operations-cost-portal.css /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
