# Dockerfile for sovereign-ai-act-mcp — stdio MCP server (Glama safety/quality checks).
FROM node:20-slim
WORKDIR /app

# Install dependencies first (better layer caching).
# npm ci = clean, reproducible install pinned to package-lock.json (deterministic, audited builds).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# App source
COPY . .

ENV NODE_ENV=production
# stdio MCP server — Glama communicates over stdin/stdout
ENTRYPOINT ["node", "index.js"]
