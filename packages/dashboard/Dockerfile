# packages/dashboard/Dockerfile
# Multi-stage build for the Dashboard service
# Builds the backend API + React frontend

# ============================================
# Base Stage
# ============================================
FROM node:20-alpine AS base
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install system dependencies (including build tools for native modules)
RUN apk add --no-cache curl bash python3 make g++

# ============================================
# Dependencies Stage (Backend)
# ============================================
FROM base AS deps

# Copy workspace config files
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY package.json ./

# Copy package.json files for all packages this depends on
COPY packages/core/package.json ./packages/core/
COPY packages/database/package.json ./packages/database/
COPY packages/database-services/package.json ./packages/database-services/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/mcp-servers/package.json ./packages/mcp-servers/
COPY packages/mcp-tools/package.json ./packages/mcp-tools/
COPY packages/agents/package.json ./packages/agents/
COPY packages/apps/package.json ./packages/apps/
COPY packages/api-gateway/package.json ./packages/api-gateway/
COPY packages/bot-whatsapp/package.json ./packages/bot-whatsapp/
COPY packages/dashboard/package.json ./packages/dashboard/

# Install dependencies for this package and its dependencies
# Use BuildKit cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @orient-bot/dashboard...

# ============================================
# Build Stage (Backend)
# ============================================
FROM deps AS builder

# Copy source files for all required packages
COPY packages/core ./packages/core
COPY packages/database ./packages/database
COPY packages/database-services ./packages/database-services
COPY packages/integrations ./packages/integrations
COPY packages/mcp-servers ./packages/mcp-servers
COPY packages/mcp-tools ./packages/mcp-tools
COPY packages/agents ./packages/agents
COPY packages/apps ./packages/apps
COPY packages/api-gateway ./packages/api-gateway
COPY packages/bot-whatsapp ./packages/bot-whatsapp
COPY packages/dashboard ./packages/dashboard
COPY tsconfig.json turbo.json ./

# Reinstall to fix workspace symlinks after copying source
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @orient-bot/dashboard...

# Clear any incremental build artifacts and build fresh
RUN find /app/packages -name "tsconfig.tsbuildinfo" -delete 2>/dev/null || true && \
    find /app/packages -name "*.d.ts.map" -delete 2>/dev/null || true

# Build packages using tsc with --build to respect project references
RUN npx tsc --build /app/packages/core && \
    npx tsc --build /app/packages/database && \
    npx tsc --build /app/packages/integrations && \
    cd /app/packages/integrations && npm run copy:manifests && \
    npx tsc --build /app/packages/database-services && \
    npx tsc --build /app/packages/mcp-tools && \
    echo "=== mcp-tools dist ===" && \
    ls -la /app/packages/mcp-tools/dist/ && \
    npx tsc --build /app/packages/agents && \
    npx tsc --build /app/packages/api-gateway && \
    npx tsc --build /app/packages/apps && \
    npx tsc --build /app/packages/bot-whatsapp && \
    npx tsc --build /app/packages/mcp-servers && \
    npx tsc --build /app/packages/dashboard

# ============================================
# Frontend Build Stage
# ============================================
FROM base AS frontend-builder

# Copy frontend package (now in packages/dashboard-frontend)
COPY packages/dashboard-frontend ./packages/dashboard-frontend

WORKDIR /app/packages/dashboard-frontend

# Install frontend dependencies
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install

# Build the frontend (vite build with base: /dashboard/)
RUN pnpm run build

# ============================================
# Production Stage
# ============================================
FROM node:20-alpine AS runner
WORKDIR /app

# Install pnpm and runtime dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate
# openssh-client is needed for production monitoring (SSH to collect server metrics)
# Build tools (python3, make, g++) are needed to compile native modules like better-sqlite3
RUN apk add --no-cache curl bash openssh-client python3 make g++

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy built packages with ownership set at copy-time (much faster than chown -R)
COPY --chown=nodejs:nodejs --from=builder /app/packages/core/dist ./packages/core/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/core/package.json ./packages/core/
COPY --chown=nodejs:nodejs --from=builder /app/packages/database/dist ./packages/database/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/database/drizzle ./packages/database/drizzle
COPY --chown=nodejs:nodejs --from=builder /app/packages/database/package.json ./packages/database/
COPY --chown=nodejs:nodejs --from=builder /app/packages/database-services/dist ./packages/database-services/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/database-services/package.json ./packages/database-services/
COPY --chown=nodejs:nodejs --from=builder /app/packages/integrations/dist ./packages/integrations/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/integrations/package.json ./packages/integrations/
COPY --chown=nodejs:nodejs --from=builder /app/packages/mcp-servers/dist ./packages/mcp-servers/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/mcp-servers/package.json ./packages/mcp-servers/
COPY --chown=nodejs:nodejs --from=builder /app/packages/mcp-tools/dist ./packages/mcp-tools/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/mcp-tools/package.json ./packages/mcp-tools/
COPY --chown=nodejs:nodejs --from=builder /app/packages/agents/dist ./packages/agents/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/agents/package.json ./packages/agents/
COPY --chown=nodejs:nodejs --from=builder /app/packages/apps/dist ./packages/apps/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/apps/package.json ./packages/apps/
COPY --chown=nodejs:nodejs --from=builder /app/packages/api-gateway/dist ./packages/api-gateway/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/api-gateway/package.json ./packages/api-gateway/
COPY --chown=nodejs:nodejs --from=builder /app/packages/bot-whatsapp/dist ./packages/bot-whatsapp/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/bot-whatsapp/package.json ./packages/bot-whatsapp/
COPY --chown=nodejs:nodejs --from=builder /app/packages/dashboard/dist ./packages/dashboard/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/dashboard/package.json ./packages/dashboard/

# Copy frontend build with ownership
COPY --chown=nodejs:nodejs --from=frontend-builder /app/packages/dashboard-frontend/dist ./packages/dashboard/public

# Install production dependencies only
# Use BuildKit cache mount for faster rebuilds
# Use --ignore-scripts to skip husky prepare, then manually rebuild better-sqlite3
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --filter @orient-bot/dashboard... && \
    cd /app/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run build-release && \
    chown -R nodejs:nodejs /app/node_modules

# Create logs directory and set ownership only for runtime directory
RUN mkdir -p /app/logs && \
    chown nodejs:nodejs /app/logs

# Set working directory to package
WORKDIR /app/packages/dashboard

# Set environment variables
ENV NODE_ENV=production
ENV LOG_DIR=/app/logs
ENV DASHBOARD_PORT=4098
ENV DASHBOARD_STATIC_PATH=/app/packages/dashboard/public

# Expose port
EXPOSE 4098

# Health check (use /health endpoint which doesn't require auth)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:4098/health || exit 1

# Run as non-root user
USER nodejs

# Start the dashboard
CMD ["node", "dist/main.js"]
