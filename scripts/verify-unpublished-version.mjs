import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function verifyUnpublishedVersion({ name, version, registry, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== "function") throw new Error("fetch implementation is required");
  if (registry !== "https://registry.npmjs.org/") throw new Error("canonical npm registry is required");

  const packagePath = `${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
  const response = await fetchImpl(new URL(packagePath, registry), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 404) return;
  if (response.ok) throw new Error(`${name}@${version} is already published and npm versions are immutable`);
  throw new Error(`npm registry verification failed closed with HTTP ${response.status}`);
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

  try {
    await verifyUnpublishedVersion({
      name: packageJson.name,
      version: packageJson.version,
      registry: packageJson.publishConfig?.registry,
    });
    console.log(`unpublished npm version verified: ${packageJson.name}@${packageJson.version}`);
  } catch (error) {
    console.error(`release verification failed: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
