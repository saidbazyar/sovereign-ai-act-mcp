#!/usr/bin/env node
/**
 * Sovereign AI Act — MCP server
 * Exposes Leo, the deterministic EU AI Act classifier — Regulation (EU) 2024/1689 as amended by
 * Regulation (EU) 2026/1744 (the Digital Omnibus on AI, in force 27 July 2026) —
 * as tools any MCP-capable AI agent (Claude Desktop, IDEs, custom agents) can call.
 * Every answer is grounded verbatim in the official law — Leo never guesses.
 *
 * Tools:
 *   - classify_ai_system        : map a plain-language AI description to its EU AI Act risk tier + binding Articles
 *   - lookup_article            : fetch the verbatim text of any Article (1–113 of the 2024 text)
 *   - search_eu_ai_act          : full-text search across Articles, Recitals and Annexes
 *   - get_compliance_deadlines  : the application dates in force under Regulation (EU) 2026/1744 + fine tiers
 *
 * Transport: stdio. Backed by the public API at https://www.regulatoryai.eu/api/*
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const VERSION = "1.4.0";
const BASE = process.env.SOVEREIGN_API_BASE || "https://www.regulatoryai.eu";
const UA = `sovereign-ai-act-mcp/${VERSION} (+https://www.regulatoryai.eu/for-ai/)`;

// The 24 official EU languages the EU AI Act corpus is published in (ISO 639-1).
const LANGS = ["bg","cs","da","de","el","en","es","et","fi","fr","ga","hr","hu","it","lt","lv","mt","nl","pl","pt","ro","sk","sl","sv"];
const langSchema = {
  type: "string",
  enum: LANGS,
  default: "en",
  description: "Language for the answer, as an ISO 639-1 code — one of the EU AI Act's 24 official languages (e.g. 'en' English, 'de' German, 'fr' French, 'es' Spanish, 'sv' Swedish). Defaults to 'en'.",
};

// Application dates in force. Source: Regulation (EU) 2024/1689 as amended by Regulation (EU) 2026/1744
// (the Digital Omnibus on AI) — signed 8 July 2026, Official Journal 24 July 2026, in force 27 July 2026.
// Statuses are computed at call time so this server never reports a passed date as "upcoming".
const MILESTONES = [
  { date: "2025-02-02", applies: "Prohibited practices (Article 5) and the AI-literacy duty (Article 4 — replaced by Reg 2026/1744: take measures to support AI literacy; no specific level need be guaranteed)" },
  { date: "2025-08-02", applies: "General-purpose AI (GPAI) model obligations and governance (Articles 51–55)" },
  { date: "2026-07-27", applies: "Regulation (EU) 2026/1744 in force; Articles 102–110 apply (Article 113(d))" },
  { date: "2026-08-02", applies: "Article 50 transparency in FULL — disclose AI interaction, deepfake disclosure, emotion-recognition notices AND Article 50(2) machine-readable marking of synthetic content" },
  { date: "2026-12-02", applies: "New Article 5 prohibitions — AI generating non-consensual intimate imagery or CSAM (Art 5(1)(ba),(bb), 5(1a),(1b)); and the Article 111(4) deadline for systems placed on the market BEFORE 2 Aug 2026 to comply with Article 50(2)" },
  { date: "2027-08-02", applies: "National AI regulatory sandboxes operational (Article 57(1) as replaced — deferred from 2 Aug 2026)" },
  { date: "2027-12-02", applies: "High-risk obligations — standalone Annex III systems (Article 6(2)); deferred from 2 Aug 2026" },
  { date: "2028-08-02", applies: "High-risk obligations — regulated products, Annex I (Article 6(1)); deferred from 2 Aug 2027. Note Article 6(1a)–(1c): AI used solely for non-safety aspects is not a safety component" },
];
const deadlines = () => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    source: "Regulation (EU) 2024/1689 as amended by Regulation (EU) 2026/1744 (Digital Omnibus on AI; OJ L 24 July 2026; in force 27 July 2026) — CELEX 32024R1689 + 32026R1744",
    as_of: today,
    milestones: MILESTONES.map((m) => ({ ...m, status: m.date <= today ? "in force" : "upcoming" })),
    fines: { prohibited: "up to €35M or 7% of global annual turnover", high_risk_breach: "up to €15M or 3%", wrong_info: "up to €7.5M or 1%", sme_note: "for SMEs the fine is the lower of the fixed amount or the percentage" },
    disclaimer: "Indicative — confirm against the official text (EUR-Lex 32024R1689 and 32026R1744). Not legal advice.",
  };
};

const TOOLS = [
  {
    name: "classify_ai_system",
    description:
      "Classify an AI system under the EU AI Act (Regulation (EU) 2024/1689 as amended by Regulation (EU) 2026/1744). Give a plain-language description of " +
      "what the system does and it returns the risk tier (prohibited / high_risk / limited / minimal), the exact " +
      "Annex III category where applicable, and the binding Articles — every reference grounded verbatim in the law. " +
      "USE THIS when the user asks whether an AI system is high-risk or prohibited, what obligations apply to it, or " +
      "which Articles bind a specific AI use-case. For looking up one known Article use lookup_article; for keyword " +
      "search use search_eu_ai_act.",
    annotations: { title: "Classify an AI system (EU AI Act risk tier)", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          minLength: 4,
          description: "Plain-language description of the AI system: what it does, who it affects, and the context of use. The more specific, the more precise the classification.",
          examples: [
            "An AI that screens and ranks job applicants' CVs for a recruiter",
            "A chatbot that answers customer questions on an e-commerce website",
            "Real-time facial recognition used by police in public spaces",
            "A credit-scoring model that decides who gets a consumer loan",
          ],
        },
        language: langSchema,
        full: {
          type: "boolean",
          default: false,
          description: "When true, include the verbatim cited Article/Annex text in the response (longer). When false (default), return the classification and references only.",
        },
      },
      required: ["description"],
      additionalProperties: false,
    },
  },
  {
    name: "lookup_article",
    description:
      "Return the verbatim text of one specific EU AI Act Article (1–113), exactly as published in the Official " +
      "Journal of the EU. USE THIS when the user names or asks for a known Article number (e.g. 'show me Article 6', " +
      "'what does Article 5 say'). For keyword/topic search across the whole law use search_eu_ai_act; to classify a " +
      "system use classify_ai_system.",
    annotations: { title: "Look up an EU AI Act Article (verbatim)", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        number: {
          type: "integer",
          minimum: 1,
          maximum: 113,
          description: "The Article number to retrieve, an integer from 1 to 113. Examples: 5 (prohibited practices), 6 (high-risk classification), 9 (risk management), 14 (human oversight), 50 (transparency), 99 (penalties).",
          examples: [5, 6, 14, 50, 99],
        },
        language: langSchema,
      },
      required: ["number"],
      additionalProperties: false,
    },
  },
  {
    name: "search_eu_ai_act",
    description:
      "Full-text keyword search across the entire EU AI Act corpus — all Articles (1–113), Recitals (1–180) and " +
      "Annexes (I–XIII) — returning the provisions that match your terms, each grounded verbatim in the law. USE THIS " +
      "when you want to find where a topic, term or obligation is addressed but do not know the Article number " +
      "(e.g. 'where does the law cover human oversight?', 'find biometric categorisation', 'rules for GPAI'). To fetch " +
      "one known Article use lookup_article; to assess a specific system's risk tier use classify_ai_system.",
    annotations: { title: "Search the EU AI Act (Articles, Recitals, Annexes)", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 2,
          description: "Keyword(s) or short phrase to search for across the EU AI Act. Use legal/topic terms rather than full questions for best matches.",
          examples: [
            "human oversight",
            "biometric categorisation",
            "general-purpose AI systemic risk",
            "conformity assessment",
            "fundamental rights impact assessment",
          ],
        },
        language: langSchema,
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_compliance_deadlines",
    description:
      "Return the canonical EU AI Act application timeline (the staggered dates each obligation starts to apply, " +
      "as amended by Regulation (EU) 2026/1744, the Digital Omnibus on AI, in force 27 July 2026) together with the penalty/fine tiers under Article 99. Takes no " +
      "arguments. USE THIS when the user asks when the EU AI Act (or a specific obligation) applies, what the key " +
      "compliance deadlines are, or how large the fines can be.",
    annotations: { title: "EU AI Act deadlines & fine tiers", readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
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

const server = new Server({ name: "sovereign-ai-act", version: VERSION }, { capabilities: { tools: {} } });
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
    result = { ok: true, ...deadlines(), attribution: "Sovereign AI Act — https://www.regulatoryai.eu" };
  } else {
    result = { ok: false, error: `Unknown tool: ${name}` };
  }
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: result && result.ok === false };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Sovereign AI Act MCP server v${VERSION} running (stdio) · ${BASE}`);
