# packages/bot-slack/Dockerfile
# Multi-stage build for the Slack Bot service
# Builds only this package + its workspace dependencies

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
# Dependencies Stage
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
COPY packages/mcp-tools/package.json ./packages/mcp-tools/
COPY packages/agents/package.json ./packages/agents/
COPY packages/bot-slack/package.json ./packages/bot-slack/

# Install dependencies for this package and its dependencies
# Use BuildKit cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @orientbot/bot-slack...

# ============================================
# Build Stage
# ============================================
FROM deps AS builder

# Copy source files for all required packages
COPY packages/core ./packages/core
COPY packages/database ./packages/database
COPY packages/database-services ./packages/database-services
COPY packages/integrations ./packages/integrations
COPY packages/mcp-tools ./packages/mcp-tools
COPY packages/agents ./packages/agents
COPY packages/bot-slack ./packages/bot-slack
COPY tsconfig.json turbo.json ./

# Build the package and its dependencies using turbo for correct ordering
RUN pnpm turbo run build --filter='@orientbot/bot-slack...'

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

# Copy built packages with ownership
COPY --chown=nodejs:nodejs --from=builder /app/packages/core/dist ./packages/core/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/core/package.json ./packages/core/
COPY --chown=nodejs:nodejs --from=builder /app/packages/database/dist ./packages/database/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/database/package.json ./packages/database/
COPY --chown=nodejs:nodejs --from=builder /app/packages/database-services/dist ./packages/database-services/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/database-services/package.json ./packages/database-services/
COPY --chown=nodejs:nodejs --from=builder /app/packages/integrations/dist ./packages/integrations/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/integrations/package.json ./packages/integrations/
COPY --chown=nodejs:nodejs --from=builder /app/packages/mcp-tools/dist ./packages/mcp-tools/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/mcp-tools/package.json ./packages/mcp-tools/
COPY --chown=nodejs:nodejs --from=builder /app/packages/agents/dist ./packages/agents/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/agents/package.json ./packages/agents/
COPY --chown=nodejs:nodejs --from=builder /app/packages/bot-slack/dist ./packages/bot-slack/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/bot-slack/package.json ./packages/bot-slack/

# Install production dependencies only
# Use BuildKit cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --filter @orientbot/bot-slack...

# Create directories
RUN mkdir -p /app/logs && \
    chown -R nodejs:nodejs /app

# Set working directory to package
WORKDIR /app/packages/bot-slack

# Set environment variables
ENV NODE_ENV=production
ENV LOG_DIR=/app/logs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Run as non-root user
USER nodejs

# Start the bot
CMD ["node", "dist/main.js"]
