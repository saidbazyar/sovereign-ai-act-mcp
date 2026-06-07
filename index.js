#!/usr/bin/env node
/**
 * Sovereign AI Act — MCP server
 * Exposes Leo, the deterministic EU AI Act (Regulation (EU) 2024/1689) classifier,
 * as tools any MCP-capable AI agent (Claude Desktop, IDEs, custom agents) can call.
 * Every answer is grounded verbatim in the official law — Leo never guesses.
 *
 * Tools:
 *   - classify_ai_system        : map a plain-language AI description to its EU AI Act risk tier + binding Articles
 *   - lookup_article            : fetch the verbatim text of any Article (1–113)
 *   - search_eu_ai_act          : full-text search across Articles, Recitals and Annexes
 *   - get_compliance_deadlines  : the canonical post-Digital-Omnibus application dates + fine tiers
 *
 * Transport: stdio. Backed by the public API at https://www.regulatoryai.eu/api/*
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const BASE = process.env.SOVEREIGN_API_BASE || "https://www.regulatoryai.eu";
const UA = "sovereign-ai-act-mcp/1.1.1 (+https://www.regulatoryai.eu/for-ai/)";

// Canonical post-Digital-Omnibus (7 May 2026) EU AI Act application dates.
const DEADLINES = {
  source: "Regulation (EU) 2024/1689, as adjusted by the Digital Omnibus (political agreement 7 May 2026)",
  milestones: [
    { date: "2025-02-02", applies: "Prohibited practices (Article 5) & AI literacy (Article 4)", status: "in force" },
    { date: "2025-08-02", applies: "General-purpose AI (GPAI) models & governance (Articles 51–55)", status: "in force" },
    { date: "2026-08-02", applies: "Article 50(1) transparency — disclose AI interaction; national regulatory sandboxes (Article 57)", status: "upcoming" },
    { date: "2026-12-02", applies: "Article 50(2) — machine-readable marking of synthetic content / deepfakes", status: "upcoming" },
    { date: "2027-12-02", applies: "High-risk obligations — standalone Annex III systems (Article 6(2))", status: "upcoming" },
    { date: "2028-08-02", applies: "High-risk obligations — regulated products, Annex I (Article 6(1))", status: "upcoming" },
  ],
  fines: { prohibited: "up to €35M or 7% of global annual turnover", high_risk_breach: "up to €15M or 3%", wrong_info: "up to €7.5M or 1%", sme_note: "for SMEs the fine is the lower of the fixed amount or the percentage" },
  disclaimer: "Indicative — confirm against the official text. Not legal advice.",
};

const TOOLS = [
  {
    name: "classify_ai_system",
    description:
      "Classify an AI system under the EU AI Act (Regulation (EU) 2024/1689). Returns the risk tier " +
      "(prohibited / high_risk / limited / minimal), the exact Annex III category and the binding Articles, " +
      "grounded verbatim in the law. Use whenever a user asks whether an AI system is high-risk, prohibited, " +
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
  {
    name: "get_compliance_deadlines",
    description: "Return the canonical EU AI Act application dates (post Digital-Omnibus) and the fine tiers. Use when asked when the EU AI Act applies, when a deadline is, or how big the fines are.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function call(path, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(BASE + path, { ...opts, signal: ctrl.signal, headers: { "user-agent": UA, ...(opts.headers || {}) } });
    const text = await r.text();
    try { return JSON.parse(text); } catch { return { ok: false, error: "Non-JSON response", status: r.status, body: text.slice(0, 400) }; }
  } catch (e) {
    return { ok: false, error: e.name === "AbortError" ? "Request timed out." : String(e.message || e) };
  } finally { clearTimeout(t); }
}

const server = new Server({ name: "sovereign-ai-act", version: "1.1.1" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: a = {} } = req.params;
  const lang = (a.language || "en").slice(0, 2);
  let result;
  if (name === "classify_ai_system") {
    if (!a.description || String(a.description).trim().length < 4) result = { ok: false, error: "Provide a 'description' of the AI system (min 4 chars)." };
    else result = await call("/api/classify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: a.description, language: lang, full: !!a.full }) });
  } else if (name === "lookup_article") {
    const n = parseInt(a.number, 10);
    if (!Number.isInteger(n) || n < 1 || n > 113) result = { ok: false, error: "Article number must be 1–113." };
    else result = await call(`/api/article/${n}?language=${lang}`);
  } else if (name === "search_eu_ai_act") {
    if (!a.query || String(a.query).trim().length < 2) result = { ok: false, error: "Provide a 'query' (min 2 chars)." };
    else result = await call(`/api/search?q=${encodeURIComponent(a.query)}&language=${lang}`);
  } else if (name === "get_compliance_deadlines") {
    result = { ok: true, ...DEADLINES, attribution: "Sovereign AI Act — https://www.regulatoryai.eu" };
  } else {
    result = { ok: false, error: `Unknown tool: ${name}` };
  }
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: result && result.ok === false };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Sovereign AI Act MCP server v1.1.1 running (stdio) · " + BASE);
