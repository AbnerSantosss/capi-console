# ---------- 1. dependencias ----------
FROM node:22-alpine AS deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1 NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- 2. build ----------
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=2048
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
RUN npm run build

# ---------- 3. runtime ----------
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3333 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1 TZ=America/Sao_Paulo
RUN apk add --no-cache tzdata \
 && addgroup -S nodejs -g 1001 \
 && adduser -S nextjs -u 1001 -G nodejs \
 && chown -R nextjs:nodejs /app
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
# O tracing do Next arrasta config/ e logs/ da maquina de build para dentro do
# standalone. O .dockerignore ja os tira do contexto, mas apagar aqui garante
# que nenhum token, segredo de entrada ou dado de comprador entre na imagem,
# mesmo que alguem construa fora do fluxo normal.
# As pastas sao recriadas com dono nextjs ANTES de o volume montar: volume
# nascido root faria o mkdir da aplicacao falhar e o segredo se perderia.
RUN rm -rf /app/config /app/logs \
 && mkdir -p /app/config /app/logs \
 && chown -R nextjs:nodejs /app/config /app/logs
USER nextjs
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3333/api/health >/dev/null 2>&1 || exit 1
CMD ["node", "server.js"]
