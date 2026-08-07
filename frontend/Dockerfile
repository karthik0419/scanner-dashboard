# ── Build stage ──
FROM node:20-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

COPY . .
RUN npm run build
# Next.js standalone output: .next/standalone/ has a minimal server + only needed deps

# ── Runtime stage (tiny — no node_modules) ──
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=http://localhost:8000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy standalone server (includes minimal node_modules — ~2MB, not 360MB)
COPY --from=builder /app/.next/standalone ./
# Copy static assets (CSS, JS chunks, images)
COPY --from=builder /app/.next/static ./.next/static
# Copy public folder if it exists
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
