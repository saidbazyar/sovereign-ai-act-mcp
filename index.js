#!/usr/bin/env node
/**
 * Sovereign AI Act — MCP server
 * Exposes Leo, the deterministic EU AI Act (Regulation (EU) 2024/1689) classifier,
 * as tools any MCP-capable AI agent (Claude Desktop, IDEs, custom agents) can call.
 * Every answer is grounded verbatim in the official law — Leo never guesses.
 *
 * Tools:
 *   - classify_ai_system : map a plain-language AI description to its EU AI Act risk tier + binding Articles
 *   - lookup_article     : fetch the verbatim text of any Article (1–113)
 *   - search_eu_ai_act   : full-text search across Articles, Recitals and Annexes
 *
 * Transport: stdio. Backed by the public API at https://www.regulatoryai.eu/api/*
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const BASE = process.env.SOVEREIGN_API_BASE || "https://www.regulatoryai.eu";

const TOOLS = [
  {
    name: "classify_ai_system",
    description:
      "Classify an AI system under the EU AI Act (Regulation (EU) 2024/1689). Returns the risk tier " +
      "(prohibited / high_risk / limited / minimal), the exact Annex III category and the binding Articles, " +
      "grounded verbatim in the law. Use this whenever a user asks whether an AI system is high-risk, prohibited, " +
      "what obligations apply, or which Articles bind a given AI use-case.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Plain-language description of the AI system and what it does." },
        language: { type: "string", description: "ISO 639-1 code (en, de, fr, es, it, sv, …). Default en.", default: "en" },
        full: { type: "boolean", description: "Include the verbatim cited Article/Annex text. Default false.", default: false },
      },
      required: ["description"],
    },
  },
  {
    name: "lookup_article",
    description: "Return the verbatim text of a specific EU AI Act Article (1–113), as published by the EU.",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "integer", description: "Article number, 1–113." },
        language: { type: "string", description: "ISO 639-1 code. Default en.", default: "en" },
      },
      required: ["number"],
    },
  },
  {
    name: "search_eu_ai_act",
    description: "Full-text search across the EU AI Act corpus (Articles, Recitals, Annexes). Returns matching provisions.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms, e.g. 'biometric', 'human oversight', 'GPAI'." },
        language: { type: "string", description: "ISO 639-1 code. Default en.", default: "en" },
      },
      required: ["query"],
    },
  },
];

async function call(path, opts) {
  const r = await fetch(BASE + path, opts);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { ok: false, error: "Non-JSON response", status: r.status, body: text.slice(0, 500) }; }
}

const server = new Server({ name: "sovereign-ai-act", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: a = {} } = req.params;
  const lang = (a.language || "en").slice(0, 2);
  let result;
  try {
    if (name === "classify_ai_system") {
      result = await call("/api/classify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: a.description, language: lang, full: !!a.full }),
      });
    } else if (name === "lookup_article") {
      result = await call(`/api/article/${encodeURIComponent(a.number)}?language=${lang}`);
    } else if (name === "search_eu_ai_act") {
      result = await call(`/api/search?q=${encodeURIComponent(a.query)}&language=${lang}`);
    } else {
      result = { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    result = { ok: false, error: String(e && e.message ? e.message : e) };
  }
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Sovereign AI Act MCP server running (stdio) · " + BASE);
