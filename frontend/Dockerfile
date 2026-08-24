ARG APP_VERSION=0.1.0
ARG BUILD_COMMIT=unknown
ARG BUILD_TIME

FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_MEDIZINHUB_API_URL=http://localhost:8080/api/v1
ARG BUILD_COMMIT=unknown
ENV NEXT_PUBLIC_MEDIZINHUB_API_URL=$NEXT_PUBLIC_MEDIZINHUB_API_URL
ENV MEDIZINHUB_DEPLOYMENT_ID=$BUILD_COMMIT
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Docker builds start from a clean filesystem. Invoke Next directly so the
# host-only prebuild cleanup script outside the ./frontend build context is
# not required (or incorrectly resolved as /scripts inside the image).
RUN NEXT_PRIVATE_BUILD_WORKER=0 ./node_modules/.bin/next build

FROM node:24-alpine AS runner
ARG APP_VERSION
ARG BUILD_COMMIT
ARG BUILD_TIME
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
LABEL org.opencontainers.image.title="MedizinHub HMS Web"
LABEL org.opencontainers.image.version=$APP_VERSION
LABEL org.opencontainers.image.revision=$BUILD_COMMIT
LABEL org.opencontainers.image.created=$BUILD_TIME
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=builder --chown=nextjs:nextjs /app/.next-build/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next-build/static ./.next-build/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
