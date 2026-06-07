# Sovereign AI Act — MCP server

Give your AI agent a **trustworthy EU AI Act expert**. This [Model Context Protocol](https://modelcontextprotocol.io) server exposes **Leo** — the deterministic classifier for **Regulation (EU) 2024/1689 (the EU AI Act)** — as callable tools. Every answer is grounded **verbatim** in the official law. Leo never guesses.

## Tools

| Tool | What it does |
|------|--------------|
| `classify_ai_system` | Map a plain-language AI description → risk tier (prohibited / high-risk / limited / minimal) + the exact Annex III category and binding Articles. |
| `lookup_article` | Verbatim text of any Article (1–113). |
| `search_eu_ai_act` | Full-text search across Articles, Recitals and Annexes. |

## Use it with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sovereign-ai-act": {
      "command": "npx",
      "args": ["-y", "sovereign-ai-act-mcp"]
    }
  }
}
```

Then ask Claude: *"Is an AI that screens job applicants high-risk under the EU AI Act?"* — it will call Leo and answer with the exact Articles.

## Run directly

```bash
npx -y sovereign-ai-act-mcp
# or
node index.js
```

No API key required. It calls the free public API at `https://www.regulatoryai.eu/api/*`
(`SOVEREIGN_API_BASE` env var overrides the base URL).

## The same API, without MCP

```bash
curl -X POST https://www.regulatoryai.eu/api/classify \
  -H "content-type: application/json" \
  -d '{"description":"AI that screens job applicants and ranks CVs"}'
```

Returns the tier, the Annex III category, and the binding Articles — CORS-open, no key.

---

Powered by **Sovereign AI Act** (regulatoryai.eu) · operated by Dominion Intelligence AB · hosted in the EU.
Indicative classification, grounded in the official text — not legal advice.
