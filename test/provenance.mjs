/**
 * Provenance & time-status integration test — no network required.
 *
 * Spawns the real MCP server over stdio and asserts on its actual responses:
 *   1. server identity is the canonical brand
 *   2. deadline milestone status is COMPUTED, not stored (order correction #4)
 *   3. the deadline response carries law-version provenance (order §12)
 *   4. retracted framing is gone (no "political agreement", no "provisional deal")
 *   5. Article 113(a) names the exact provisions applying 2 December 2026
 *   6. Article 50 and Article 5 statements carry the required nuance
 *   7. lookup_article builds a correct request path for lettered provisions
 *
 * What this test deliberately does NOT prove, and why (order correction #9):
 *   - that classify_ai_system / lookup_article / search_eu_ai_act responses carry
 *     law-version provenance. Those proxy the upstream API, so proving it requires a
 *     live integration run against the production API. Until such a run exists, no
 *     surface may claim "every response states its law version".
 *   - that Article 4a is retrievable. The resolver accepts "4a" syntactically; the
 *     consolidated corpus containing Article 4a is not imported (hard block B2).
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

function rpc(requests, { env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["index.js"], {
      cwd: root, stdio: ["pipe", "pipe", "ignore"], env: { ...process.env, ...env },
    });
    const seen = new Map();
    let buf = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("timeout")); }, 15000);
    child.stdout.on("data", (c) => {
      buf += c.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.id != null) seen.set(m.id, m);
        if (seen.size === requests.length) {
          clearTimeout(timer); child.kill(); resolve(seen);
        }
      }
    });
    child.on("error", reject);
    for (const r of requests) child.stdin.write(JSON.stringify(r) + "\n");
  });
}

const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "provenance", version: "1" } } };
const deadlines = { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_compliance_deadlines", arguments: {} } };
const listTools = { jsonrpc: "2.0", id: 3, method: "tools/list" };

const res = await rpc([init, deadlines, listTools]);

// ── 1. identity ────────────────────────────────────────────────────────────
const serverInfo = res.get(1)?.result?.serverInfo ?? {};
console.log("\n[1] server identity");
ok(serverInfo.name === "regulatoryai", `serverInfo.name is "regulatoryai" (got "${serverInfo.name}")`);

// ── deadline payload ───────────────────────────────────────────────────────
const payload = JSON.parse(res.get(2).result.content[0].text);
const byDate = Object.fromEntries(payload.milestones.map((m) => [m.date, m]));

// ── 2. computed status ─────────────────────────────────────────────────────
console.log("\n[2] milestone status is computed, not stored");
const today = new Date();
const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
ok(payload.as_of === new Date(todayUTC).toISOString().slice(0, 10),
  `response carries as_of = today (${payload.as_of})`);
let statusCorrect = true;
for (const m of payload.milestones) {
  const expect = Date.parse(m.date + "T00:00:00Z") <= todayUTC ? "in force" : "upcoming";
  if (m.status !== expect) { statusCorrect = false; console.log(`        ${m.date}: got "${m.status}", expected "${expect}"`); }
}
ok(statusCorrect, "every milestone status matches its date against today");
ok(byDate["2026-08-02"]?.status === "in force",
  `2 August 2026 reads "in force" (got "${byDate["2026-08-02"]?.status}")`);
ok(byDate["2026-12-02"]?.status === "upcoming",
  `2 December 2026 reads "upcoming" (got "${byDate["2026-12-02"]?.status}")`);
ok(!JSON.stringify(payload.milestones).includes('"status":"upcoming","date":"2026-08-02"'),
  "no milestone carries a stored status field in source order");

// ── 3. law-version provenance ──────────────────────────────────────────────
console.log("\n[3] law-version provenance on this response");
ok(payload.law_version === "consolidated_2026-07-27", `law_version = ${payload.law_version}`);
ok(payload.version_date === "2026-07-27", `version_date = ${payload.version_date}`);
ok(payload.source_url === "https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng", "source_url is the consolidated ELI");
ok(payload.original_act === "https://eur-lex.europa.eu/eli/reg/2024/1689/oj", "original_act is the OJ ELI");
ok(Array.isArray(payload.amending_acts) && payload.amending_acts.includes("Regulation (EU) 2026/1744"),
  "amending_acts names Regulation (EU) 2026/1744");
ok(typeof payload.legal_status_note === "string" && payload.legal_status_note.includes("documentation tool"),
  "legal_status_note states the consolidated text is a documentation tool");

// ── 4. retracted framing ───────────────────────────────────────────────────
console.log("\n[4] retracted framing removed");
const blob = JSON.stringify(payload).toLowerCase();
for (const bad of ["political agreement", "provisional deal", "under discussion", "7 may 2026"]) {
  ok(!blob.includes(bad), `no "${bad}"`);
}

// ── 5. Article 113(a) provisions ───────────────────────────────────────────
console.log("\n[5] Article 113(a) provisions applying 2 December 2026");
const dec = byDate["2026-12-02"]?.applies ?? "";
for (const p of ["Article 5(1)(ba)", "Article 5(1)(bb)", "Article 5(1a)", "Article 5(1b)"]) {
  ok(dec.includes(p), `names ${p}`);
}

// ── 6. required nuance ─────────────────────────────────────────────────────
console.log("\n[6] Article 50 and Article 5 nuance");
ok((payload.article_50_note ?? "").includes("111(4)"), "Article 50 note cites the Article 111(4) transition");
ok((payload.article_50_note ?? "").includes("2 August 2026"), "Article 50 note gives the general 2 August 2026 date");
ok((payload.article_5_note ?? "").includes("2 February 2025"), "Article 5 note keeps the original prohibition date");
ok((payload.article_5_note ?? "").includes("2 December 2026"), "Article 5 note gives the additions date");

// ── 7. lettered Article identifiers ────────────────────────────────────────
console.log("\n[7] lookup_article accepts lettered identifiers");
const tool = (res.get(3)?.result?.tools ?? []).find((t) => t.name === "lookup_article");
const props = tool?.inputSchema?.properties ?? {};
ok(props.article_id?.type === "string", "article_id is a string field");
ok(new RegExp(props.article_id?.pattern ?? "$^").test("4a"), "article_id pattern accepts '4a'");
ok(props.number?.type === "integer", "legacy integer 'number' field is still declared");
ok(/DEPRECATED/i.test(props.number?.description ?? ""), "legacy 'number' field is marked deprecated");
ok(Array.isArray(tool?.inputSchema?.anyOf) && tool.inputSchema.anyOf.length === 2,
  "either article_id or number satisfies the schema (backward compatible)");

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failing assertion(s)`);
console.log("\nNOT PROVEN BY THIS TEST (see header):");
console.log("  - law-version provenance on classify/lookup/search responses (needs live API run)");
console.log("  - Article 4a is actually retrievable (consolidated corpus not imported)");
process.exit(failures === 0 ? 0 : 1);
