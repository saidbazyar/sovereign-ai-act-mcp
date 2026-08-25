#!/usr/bin/env node
/**
 * RegulatoryAI MCP — MCP server
 *
 * RegulatoryAI MCP gives AI agents source-linked tools for understanding and searching
 * the EU AI Act through Leo. RegulatoryAI is operated by Dominion Intelligence AB.
 *
 * The npm package name `sovereign-ai-act-mcp` is retained for backward compatibility.
 * RegulatoryAI is the canonical brand.
 *
 * Exposes Leo, the deterministic EU AI Act (Regulation (EU) 2024/1689) classifier,
 * as tools any MCP-capable AI agent (Claude Desktop, IDEs, custom agents) can call.
 * Every answer is grounded verbatim in the official law — Leo never guesses.
 *
 * Tools:
 *   - classify_ai_system        : map a plain-language AI description to its EU AI Act risk tier + binding Articles
 *   - lookup_article            : fetch the verbatim text of any Article (1–113, incl. lettered e.g. 4a)
 *   - search_eu_ai_act          : full-text search across Articles, Recitals and Annexes
 *   - get_compliance_deadlines  : the canonical consolidated-law application dates + fine tiers
 *
 * Transport: stdio. Backed by the public API at https://www.regulatoryai.eu/api/*
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const VERSION = "1.3.0";
// REGULATORYAI_API_BASE is the preferred variable. SOVEREIGN_API_BASE is kept as a
// deprecated fallback so existing integrations keep working (order §2 allowlist, §18).
const BASE = process.env.REGULATORYAI_API_BASE
  || process.env.SOVEREIGN_API_BASE
  || "https://www.regulatoryai.eu";
const UA = `regulatoryai-mcp/${VERSION} (+https://www.regulatoryai.eu/for-ai/)`;

// The 24 official EU languages the EU AI Act corpus is published in (ISO 639-1).
const LANGS = ["bg","cs","da","de","el","en","es","et","fi","fr","ga","hr","hu","it","lt","lv","mt","nl","pl","pt","ro","sk","sl","sv"];
const langSchema = {
  type: "string",
  enum: LANGS,
  default: "en",
  description: "Language for the answer, as an ISO 639-1 code — one of the EU AI Act's 24 official languages (e.g. 'en' English, 'de' German, 'fr' French, 'es' Spanish, 'sv' Swedish). Defaults to 'en'.",
};

// Canonical post-Digital-Omnibus (7 May 2026) EU AI Act application dates.
const DEADLINES = {
  source: "Regulation (EU) 2024/1689, consolidated text as of 27 July 2026 (as amended by Regulation (EU) 2026/1744)",
  law_version: "consolidated_2026-07-27",
  version_date: "2026-07-27",
  source_url: "https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng",
  original_act: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
  amending_acts: ["Regulation (EU) 2026/1744"],
  legal_status_note: "The consolidated text is a documentation tool. The authentic legal texts are the acts published in the Official Journal.",
  milestones: [
    { date: "2025-02-02", applies: "Prohibited practices (Article 5) & AI literacy (Article 4)", status: "in force" },
    { date: "2025-08-02", applies: "General-purpose AI (GPAI) models & governance (Articles 51–55)", status: "in force" },
    { date: "2026-08-02", applies: "Main application date for provisions not subject to a specific later date, including most Article 50 transparency duties; national regulatory sandboxes (Article 57)", status: "upcoming" },
    { date: "2026-12-02", applies: "Additional Article 5 prohibitions introduced by Regulation (EU) 2026/1744 and identified in Article 113(a). Also the Article 111(4) transition deadline: for systems covered by Article 50(2) placed on the market before 2 August 2026, providers have until this date to comply with the machine-readable marking requirement.", status: "upcoming" },
    { date: "2027-12-02", applies: "High-risk obligations — standalone Annex III systems (Article 6(2))", status: "upcoming" },
    { date: "2028-08-02", applies: "High-risk obligations — regulated products, Annex I (Article 6(1))", status: "upcoming" },
  ],
  fines: { prohibited: "up to €35M or 7% of global annual turnover", high_risk_breach: "up to €15M or 3%", wrong_info: "up to €7.5M or 1%", sme_note: "for SMEs the fine is the lower of the fixed amount or the percentage" },
  article_50_note: "Most Article 50 transparency duties apply from 2 August 2026. For systems covered by Article 50(2) that were placed on the market before 2 August 2026, Article 111(4) gives providers until 2 December 2026 to comply with the machine-readable marking requirement.",
  article_5_note: "Most original Article 5 prohibitions applied from 2 February 2025. The additional prohibitions introduced by Regulation (EU) 2026/1744 and identified in Article 113(a) apply from 2 December 2026.",
  disclaimer: "Indicative — confirm against the official text. Not legal advice.",
};

const TOOLS = [
  {
    name: "classify_ai_system",
    description:
      "Classify an AI system under the EU AI Act (Regulation (EU) 2024/1689). Give a plain-language description of " +
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
      "Return the verbatim text of one specific EU AI Act Article, exactly as published in the Official " +
      "Journal of the EU. Articles 1–113 plus lettered provisions introduced by amendment (e.g. 4a) are supported. " +
      "USE THIS when the user names or asks for a known Article (e.g. 'show me Article 6', 'what does Article 4a say', " +
      "'what does Article 5 say'). For keyword/topic search across the whole law use search_eu_ai_act; to classify a " +
      "system use classify_ai_system.",
    annotations: { title: "Look up an EU AI Act Article (verbatim)", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        article_id: {
          type: "string",
          pattern: "^(?:[1-9][0-9]{0,2})[a-z]?$",
          description: "The Article identifier to retrieve, as a string. Accepts plain numbers ('4', '50', '113') and lettered provisions introduced by amendment ('4a'). Preferred over the legacy integer 'number' field.",
          examples: ["4", "4a", "5", "6", "50", "113"],
        },
        number: {
          type: "integer",
          minimum: 1,
          maximum: 113,
          description: "DEPRECATED — use 'article_id' instead. The Article number as an integer from 1 to 113. Retained so existing integrations keep working; it cannot express lettered provisions such as 4a.",
          examples: [5, 6, 14, 50, 99],
        },
        language: langSchema,
      },
      anyOf: [{ required: ["article_id"] }, { required: ["number"] }],
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
      "reflecting the Digital Omnibus adjustment) together with the penalty/fine tiers under Article 99. Takes no " +
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

/**
 * Resolve an Article identifier from either the preferred string `article_id` or the
 * deprecated integer `number`. Returns a normalised id ("4", "4a") or null if invalid.
 * Order §12/§18: add alphanumeric support without breaking existing integer calls.
 */
function resolveArticleId(a) {
  if (a.article_id != null) {
    const raw = String(a.article_id).trim().toLowerCase().replace(/^art(?:icle)?\.?\s*/, "");
    if (!/^(?:[1-9][0-9]{0,2})[a-z]?$/.test(raw)) return null;
    return parseInt(raw, 10) >= 1 && parseInt(raw, 10) <= 113 ? raw : null;
  }
  const n = parseInt(a.number, 10);
  return Number.isInteger(n) && n >= 1 && n <= 113 ? String(n) : null;
}

const server = new Server({ name: "regulatoryai", version: VERSION }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: a = {} } = req.params;
  const lang = (a.language || "en").slice(0, 2);
  let result;
  if (name === "classify_ai_system") {
    if (!a.description || String(a.description).trim().length < 4) result = { ok: false, error: "Provide a 'description' of the AI system (min 4 chars)." };
    else result = await call("/api/classify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: a.description, language: lang, full: !!a.full }) });
  } else if (name === "lookup_article") {
    // article_id wins when supplied; the legacy integer 'number' stays fully supported.
    const id = resolveArticleId(a);
    if (!id) result = { ok: false, error: "Provide 'article_id' — a number 1–113, optionally with a letter suffix (e.g. '4a')." };
    else result = await call(`/api/article/${encodeURIComponent(id)}?language=${lang}`);
  } else if (name === "search_eu_ai_act") {
    if (!a.query || String(a.query).trim().length < 2) result = { ok: false, error: "Provide a 'query' (min 2 chars)." };
    else result = await call(`/api/search?q=${encodeURIComponent(a.query)}&language=${lang}`);
  } else if (name === "get_compliance_deadlines") {
    result = { ok: true, ...DEADLINES, attribution: "RegulatoryAI — https://www.regulatoryai.eu" };
  } else {
    result = { ok: false, error: `Unknown tool: ${name}` };
  }
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: result && result.ok === false };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`RegulatoryAI MCP server v${VERSION} running (stdio) · ${BASE}`);
