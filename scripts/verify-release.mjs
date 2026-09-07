import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function fail(message) {
  console.error(`release verification failed: ${message}`);
  process.exit(1);
}

const expectedVersion = process.env.EXPECTED_VERSION;
if (!expectedVersion) fail("EXPECTED_VERSION is required");
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expectedVersion)) {
  fail("EXPECTED_VERSION must be an exact semantic version");
}
if (expectedVersion !== packageJson.version) {
  fail(`requested version ${expectedVersion} does not match package.json ${packageJson.version}`);
}

if (process.env.CONFIRM_STAGE !== "true") {
  fail("CONFIRM_STAGE must be true");
}

if (process.env.GITHUB_ACTIONS === "true") {
  if (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch") {
    fail("only workflow_dispatch may invoke the staging workflow");
  }
  if (process.env.GITHUB_REF !== "refs/heads/main") {
    fail("the staging workflow must run from refs/heads/main");
  }
  if (process.env.GITHUB_REPOSITORY !== "saidbazyar/sovereign-ai-act-mcp") {
    fail("GitHub repository identity mismatch");
  }
}

for (const authVariable of ["NPM_TOKEN", "NODE_AUTH_TOKEN"]) {
  if (authVariable in process.env) {
    fail(`${authVariable} must not be present; npm publication authentication is OIDC-only`);
  }
}

const expectedRepository = "git+https://github.com/saidbazyar/sovereign-ai-act-mcp.git";
if (packageJson.repository?.url !== expectedRepository) {
  fail("package repository identity does not match the trusted publisher target");
}
if (packageJson.private === true) fail("package must remain public");
if (packageJson.publishConfig?.registry !== "https://registry.npmjs.org/") {
  fail("publishConfig.registry must be the canonical npm registry");
}
if (packageJson.publishConfig?.access !== "public") {
  fail("publishConfig.access must be public");
}

console.log(`release identity verified: ${packageJson.name}@${packageJson.version}`);
console.log("publication authentication boundary verified: GitHub OIDC only");
