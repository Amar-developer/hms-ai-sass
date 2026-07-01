FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_MEDIZINHUB_API_URL=http://localhost:8080/api/v1
ARG NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=false
ENV NEXT_PUBLIC_MEDIZINHUB_API_URL=$NEXT_PUBLIC_MEDIZINHUB_API_URL
ENV NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=$NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=builder --chown=nextjs:nextjs /app/.next-build/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next-build/static ./.next-build/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
