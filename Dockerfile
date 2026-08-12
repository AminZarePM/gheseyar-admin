# ---- build ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- run ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Docker متغیر HOSTNAME را برابر شناسهٔ کانتینر می‌گذارد و سرور standalone
# نِکست همان را برای bind به کار می‌برد؛ نتیجه «connection refused» می‌شود.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY deploy ./deploy

EXPOSE 3000
CMD ["node", "server.js"]
