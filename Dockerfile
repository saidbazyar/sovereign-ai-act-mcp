# Dockerfile for sovereign-ai-act-mcp — stdio MCP server (Glama safety/quality checks).
FROM node:20-slim
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# App source
COPY . .

ENV NODE_ENV=production
# stdio MCP server — Glama communicates over stdin/stdout
ENTRYPOINT ["node", "index.js"]
