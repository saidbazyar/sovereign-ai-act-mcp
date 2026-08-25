<div align="center">

# ◆ RegulatoryAI MCP

**RegulatoryAI MCP gives AI agents source-linked tools for understanding and searching the EU AI Act through Leo.**

[![npm version](https://img.shields.io/npm/v/sovereign-ai-act-mcp?color=4DD6E0&label=npm)](https://www.npmjs.com/package/sovereign-ai-act-mcp)
[![npm downloads](https://img.shields.io/npm/dm/sovereign-ai-act-mcp?color=4DD6E0)](https://www.npmjs.com/package/sovereign-ai-act-mcp)
[![license](https://img.shields.io/npm/l/sovereign-ai-act-mcp?color=C9A961)](./LICENSE)
[![MCP](https://img.shields.io/badge/Model_Context_Protocol-compatible-4DD6E0)](https://modelcontextprotocol.io)

</div>

This [Model Context Protocol](https://modelcontextprotocol.io) server exposes **Leo** — the deterministic classifier for **Regulation (EU) 2024/1689 (the EU AI Act)** — as callable tools. Every answer is grounded **verbatim** in the official law. **Leo never guesses.**

When a user asks an AI *"is my AI system high-risk under the EU AI Act?"*, the honest answer must cite the actual law — not a hallucination. This server lets your agent do exactly that.

## 🛠️ Tools

| Tool | What it does |
|------|--------------|
| `classify_ai_system` | Plain-language AI description → risk tier (prohibited / high-risk / limited / minimal) + the exact Annex III category and binding Articles. |
| `lookup_article` | Verbatim text of any Article (1–113). |
| `search_eu_ai_act` | Full-text search across Articles, Recitals and Annexes. |
| `get_compliance_deadlines` | The canonical post-Digital-Omnibus application dates and fine tiers. |

## 🚀 Install (Claude Desktop)

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

Restart Claude, then ask: *"Is an AI that screens job applicants high-risk under the EU AI Act?"* — Claude calls Leo and answers with the exact Articles.

Works the same in **Cursor**, **VS Code**, **Windsurf**, **Cline**, and any MCP-capable client.

## ⚡ Try the API directly (no install, no key)

```bash
curl -X POST https://www.regulatoryai.eu/api/classify \
  -H "content-type: application/json" \
  -d '{"description":"AI that screens job applicants and ranks CVs"}'
```

```json
{
  "ok": true,
  "tier": "high_risk",
  "classifications": [{
    "tier": "high_risk",
    "rule": "Employment, recruitment & worker management (Annex III.4)",
    "annex": "III.4",
    "articles": [6, 9, 10, 11, 13, 14, 15],
    "severity": "HIGH — conformity assessment + risk management + ..."
  }]
}
```

Also: `GET /api/article/{1-113}` · `GET /api/search?q=...`

## 💎 Why trust it

- **Verbatim law.** Articles, Recitals and Annexes loaded word-for-word from the EU Publications Office.
  The served corpus is currently the **original 2024 Official Journal text** (CELEX 32024R1689); the
  consolidated text as of 27 July 2026 is being imported. Every response states its law version.
- **Deterministic.** A rule engine, not a guess — every verdict cites the Article that binds you.
- **European.** RegulatoryAI is operated by Dominion Intelligence AB in Sweden.
- **24 languages.** Ask in your own language.

## ⚙️ Config

- `REGULATORYAI_API_BASE` — override the API base URL (default `https://www.regulatoryai.eu`).
- `SOVEREIGN_API_BASE` — **deprecated** fallback, still honoured so existing setups keep working.
- No API key required.

---

Indicative classification grounded in the official text — **not legal advice**.
[**RegulatoryAI**](https://www.regulatoryai.eu/for-ai/) · © Dominion Intelligence AB

> **On the package name.** The npm package is published as `sovereign-ai-act-mcp`. That name is
> retained for backward compatibility. **RegulatoryAI** is the canonical brand — RegulatoryAI was
> previously presented under the working name "Sovereign AI Act".
