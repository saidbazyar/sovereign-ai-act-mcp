import assert from "node:assert/strict";
import { verifyUnpublishedVersion } from "../scripts/verify-unpublished-version.mjs";

const base = {
  name: "sovereign-ai-act-mcp",
  version: "1.5.0",
  registry: "https://registry.npmjs.org/",
};

let requestedUrl;
await verifyUnpublishedVersion({
  ...base,
  fetchImpl: async (url) => {
    requestedUrl = url.href;
    return { status: 404, ok: false };
  },
});
assert.equal(requestedUrl, "https://registry.npmjs.org/sovereign-ai-act-mcp/1.5.0");

await assert.rejects(
  verifyUnpublishedVersion({ ...base, fetchImpl: async () => ({ status: 200, ok: true }) }),
  /already published/,
  "an existing version must fail closed",
);
await assert.rejects(
  verifyUnpublishedVersion({ ...base, fetchImpl: async () => ({ status: 503, ok: false }) }),
  /failed closed with HTTP 503/,
  "registry uncertainty must fail closed",
);
await assert.rejects(
  verifyUnpublishedVersion({ ...base, registry: "https://example.invalid/" }),
  /canonical npm registry is required/,
  "a substituted registry must fail closed",
);

console.log("✓ unpublished-version guard passes only a canonical npm 404 and fails closed otherwise");
