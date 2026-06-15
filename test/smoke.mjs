/**
 * Smoke test — no network required.
 * Spawns the MCP server over stdio, performs the initialize handshake, lists the
 * tools, and asserts every tool is well-formed (name, description, inputSchema).
 * Exits 0 on success, 1 on failure. Used by CI and `npm test`.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = ["classify_ai_system", "lookup_article", "search_eu_ai_act", "get_compliance_deadlines"];

function fail(msg) { console.error("✗ " + msg); process.exit(1); }

const child = spawn("node", ["index.js"], { cwd: root, stdio: ["pipe", "pipe", "inherit"] });

let buf = "";
const timer = setTimeout(() => fail("timed out waiting for tools/list response"), 10000);

child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id === 2 && msg.result) {
      clearTimeout(timer);
      const tools = msg.result.tools || [];
      const names = tools.map((t) => t.name).sort();
      if (names.join(",") !== [...EXPECTED].sort().join(",")) fail(`unexpected tools: ${names.join(",")}`);
      for (const t of tools) {
        if (!t.description || t.description.length < 20) fail(`${t.name}: description too short`);
        if (!t.inputSchema || t.inputSchema.type !== "object") fail(`${t.name}: missing inputSchema`);
      }
      console.log(`✓ ${tools.length} tools, handshake OK: ${names.join(", ")}`);
      child.kill();
      process.exit(0);
    }
  }
});

child.on("error", (e) => fail("spawn error: " + e.message));

child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "1" } } }) + "\n");
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
