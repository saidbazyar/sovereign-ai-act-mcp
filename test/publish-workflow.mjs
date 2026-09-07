import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(join(root, ".github/workflows/publish.yml"), "utf8");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const requiredFragments = [
  "workflow_dispatch:",
  "permissions:\n  contents: read",
  "id-token: write",
  "environment: npm-release",
  "persist-credentials: false",
  "node-version: '24.15.0'",
  "package-manager-cache: false",
  "npm install --global npm@12.0.2 --ignore-scripts --no-audit --no-fund",
  "npm ci --omit=dev --ignore-scripts --no-audit --no-fund",
  "npm audit --omit=dev --audit-level=high",
  "npm run release:verify",
  "node scripts/verify-unpublished-version.mjs",
  "npm pack --dry-run --json",
  "npm stage publish",
];
for (const fragment of requiredFragments) {
  assert.ok(workflow.includes(fragment), `publish workflow missing: ${fragment}`);
}

const forbiddenPatterns = [
  [/^\s{2}(?:push|pull_request|release|schedule):/m, "automatic publish trigger"],
  [/\bnpm\s+publish\b/, "direct npm publish"],
  [/\$\{\{\s*secrets\./, "GitHub secret reference"],
  [/\bNPM_TOKEN\b/, "NPM_TOKEN"],
  [/\bNODE_AUTH_TOKEN\b/, "NODE_AUTH_TOKEN"],
  [/\bregistry-url:/, "setup-node registry auth shim"],
  [/\bself-hosted\b/, "self-hosted runner"],
  [/\bcontinue-on-error:/, "non-blocking release check"],
  [/\bwrite-all\b/, "broad workflow permission"],
];
for (const [pattern, label] of forbiddenPatterns) {
  assert.ok(!pattern.test(workflow), `publish workflow contains forbidden ${label}`);
}

assert.equal((workflow.match(/id-token: write/g) || []).length, 1, "OIDC permission must be limited to the stage job");
assert.equal((workflow.match(/npm audit --omit=dev --audit-level=high/g) || []).length, 2, "dependency audit must guard both jobs");
assert.equal((workflow.match(/npm stage publish/g) || []).length, 1, "workflow must contain exactly one staging action");
assert.equal((workflow.match(/runs-on: ubuntu-24\.04/g) || []).length, 2, "both jobs must use the pinned GitHub-hosted runner image");
assert.equal((workflow.match(/timeout-minutes: 10/g) || []).length, 2, "both jobs must have bounded execution time");
const [preflightSection, stageSection] = workflow.split("\n  stage:\n");
assert.ok(preflightSection && stageSection, "preflight and stage jobs must both exist");
assert.ok(!preflightSection.includes("id-token: write"), "preflight must not receive OIDC minting permission");
assert.ok(stageSection.includes("id-token: write"), "only the stage job may receive OIDC minting permission");
assert.ok(stageSection.indexOf("verify-unpublished-version.mjs") < stageSection.indexOf("npm stage publish"), "registry guard must precede staging");

const actionReferences = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
assert.ok(actionReferences.length > 0, "workflow must contain pinned action references");
const allowedActionReferences = new Set([
  "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
  "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
]);
for (const actionReference of actionReferences) {
  assert.match(actionReference, /^[^@]+@[0-9a-f]{40}$/, `action must be pinned to a full commit: ${actionReference}`);
  assert.ok(allowedActionReferences.has(actionReference), `unapproved release action: ${actionReference}`);
}

assert.deepEqual(packageJson.files, ["index.js", "server.json"], "npm payload allowlist drift");
assert.deepEqual(packageJson.publishConfig, {
  access: "public",
  registry: "https://registry.npmjs.org/",
}, "npm publishConfig drift");

function verifyRelease(overrides = {}) {
  const env = { ...process.env };
  delete env.NPM_TOKEN;
  delete env.NODE_AUTH_TOKEN;
  Object.assign(env, {
    EXPECTED_VERSION: packageJson.version,
    CONFIRM_STAGE: "true",
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: "saidbazyar/sovereign-ai-act-mcp",
  }, overrides);
  return spawnSync(process.execPath, [join(root, "scripts/verify-release.mjs")], {
    cwd: root,
    env,
    encoding: "utf8",
  });
}

assert.equal(verifyRelease().status, 0, "valid release identity must pass");
assert.notEqual(verifyRelease({ EXPECTED_VERSION: "9.9.9" }).status, 0, "version mismatch must fail closed");
assert.notEqual(verifyRelease({ CONFIRM_STAGE: "false" }).status, 0, "missing staging confirmation must fail closed");
assert.notEqual(verifyRelease({ GITHUB_REF: "refs/heads/feature" }).status, 0, "non-main ref must fail closed");
assert.notEqual(verifyRelease({ GITHUB_REPOSITORY: "example/substituted" }).status, 0, "repository mismatch must fail closed");
assert.notEqual(verifyRelease({ NPM_TOKEN: "test-placeholder-not-a-token" }).status, 0, "token authentication must fail closed");
assert.notEqual(verifyRelease({ NODE_AUTH_TOKEN: "test-placeholder-not-a-token" }).status, 0, "token authentication must fail closed");

console.log("✓ stage-only OIDC workflow policy and fail-closed release guards");
