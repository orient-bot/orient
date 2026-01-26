# packages/api-gateway/Dockerfile
# Multi-stage build for the API Gateway service
# Builds only this package + its workspace dependencies

# ============================================
# Base Stage
# ============================================
FROM node:20-alpine AS base
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install system dependencies
RUN apk add --no-cache curl bash

# ============================================
# Dependencies Stage
# ============================================
FROM base AS deps

# Copy workspace config files
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY package.json ./

# Copy package.json files for all packages this depends on
COPY packages/core/package.json ./packages/core/
COPY packages/database/package.json ./packages/database/
COPY packages/api-gateway/package.json ./packages/api-gateway/

# Install dependencies for this package and its dependencies
# Use BuildKit cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @orientbot/api-gateway...

# ============================================
# Build Stage
# ============================================
FROM deps AS builder

# Copy source files for all required packages
COPY packages/core ./packages/core
COPY packages/database ./packages/database
COPY packages/api-gateway ./packages/api-gateway
COPY tsconfig.json ./

# Build the package and its dependencies
RUN pnpm --filter @orientbot/api-gateway... build

# ============================================
# Production Stage
# ============================================
FROM node:20-alpine AS runner
WORKDIR /app

# Install pnpm and runtime dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache curl bash

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy built packages
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/package.json ./packages/database/
COPY --from=builder /app/packages/api-gateway/dist ./packages/api-gateway/dist
COPY --from=builder /app/packages/api-gateway/package.json ./packages/api-gateway/

# Install production dependencies only
# Use BuildKit cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @orientbot/api-gateway...

# Create directories
RUN mkdir -p /app/logs && \
    chown -R nodejs:nodejs /app

# Set working directory to package
WORKDIR /app/packages/api-gateway

# Set environment variables
ENV NODE_ENV=production
ENV LOG_DIR=/app/logs
ENV API_GATEWAY_PORT=4100

# Expose port
EXPOSE 4100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4100/health || exit 1

# Run as non-root user
USER nodejs

# Start the gateway
CMD ["node", "dist/main.js"]
