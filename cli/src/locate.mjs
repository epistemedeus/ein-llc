/** SPDX-License-Identifier: MIT
 * Locate the existing EIN clients, following the
 * tools/activation-continuation/src/locate.mjs convention. Nothing is forked.
 *
 * Packed (npm tarball from scripts/pack.mjs): the selected continuation
 * archive is vendored at vendor/ein-activation-continuation, and it carries
 * its own vendor/ein-formation-http-client. The CLI loads that same copy so
 * both share one module instance.
 *
 * Repository checkout: the siblings tools/activation-continuation and
 * tools/public-ein-http-client.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CliError } from "./errors.mjs";
import { PUBLIC_CLIENT, RUNTIME_FILES, SELECTED_ARCHIVE, expectedSha256 } from "./pins.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const CONTINUATION_CANDIDATES = [
  { source: "vendor", dir: join(HERE, "../vendor/ein-activation-continuation") },
  { source: "sibling", dir: join(HERE, "../../activation-continuation") },
];

const PUBLIC_CLIENT_CANDIDATES = [
  { source: "vendor", dir: join(HERE, "../vendor/ein-activation-continuation/vendor/ein-formation-http-client") },
  { source: "sibling", dir: join(HERE, "../../public-ein-http-client") },
];

function find(candidates, required) {
  for (const candidate of candidates) {
    if (required.every((rel) => existsSync(join(candidate.dir, rel)))) return candidate;
  }
  return null;
}

function clientRoot() {
  const found = find(PUBLIC_CLIENT_CANDIDATES, RUNTIME_FILES.publicClient);
  if (found) return found;
  throw new CliError({
    code: "public_client_missing",
    message: "The public EIN formation HTTP client is not vendored in this package or beside it.",
  });
}

function continuationRoot() {
  const found = find(CONTINUATION_CANDIDATES, ["src/journey.mjs", "src/store.mjs"]);
  if (found) return found;
  throw new CliError({
    code: "continuation_client_missing",
    message: "The EIN activation continuation client is not vendored in this package or beside it.",
  });
}

let loaded;

/** tools/public-ein-http-client: transport, client, redaction, grant loader. Unchanged bytes. */
export async function publicClient() {
  if (loaded) return loaded;
  const { dir: root, source } = clientRoot();
  const [http, client, redact, grant] = await Promise.all([
    import(pathToFileURL(join(root, "lib/http.mjs")).href),
    import(pathToFileURL(join(root, "client.mjs")).href),
    import(pathToFileURL(join(root, "lib/redact.mjs")).href),
    import(pathToFileURL(join(root, "lib/grant.mjs")).href),
  ]);
  loaded = { root, source, http, client, redact, grant };
  return loaded;
}

let continuationLoaded;

/** tools/activation-continuation: executeCommand (journey) and the 0600 store. Unchanged bytes. */
export async function continuationClient() {
  if (continuationLoaded) return continuationLoaded;
  const { dir: root, source } = continuationRoot();
  const [journey, store] = await Promise.all([
    import(pathToFileURL(join(root, "src/journey.mjs")).href),
    import(pathToFileURL(join(root, "src/store.mjs")).href),
  ]);
  continuationLoaded = { root, source, journey, store };
  return continuationLoaded;
}

function sha256File(path) {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

function componentInfo(component, found) {
  if (!found) return { source: "missing", pinned: false, mismatched: [] };
  const mismatched = RUNTIME_FILES[component].filter((rel) => sha256File(join(found.dir, rel)) !== expectedSha256(component, rel));
  return { source: found.source, pinned: mismatched.length === 0, mismatched };
}

/**
 * Where the runtime clients come from and whether their bytes equal the
 * selected archive. Reads local files only; no network, no paths in output.
 */
export function runtimeInfo() {
  return {
    compatibilityFloor: {
      archive: SELECTED_ARCHIVE.file,
      sha256: SELECTED_ARCHIVE.sha256,
      url: SELECTED_ARCHIVE.url,
      publicClient: `${PUBLIC_CLIENT.name}@${PUBLIC_CLIENT.version}`,
    },
    continuation: componentInfo("continuation", find(CONTINUATION_CANDIDATES, ["src/journey.mjs", "src/store.mjs"])),
    publicClient: componentInfo("publicClient", find(PUBLIC_CLIENT_CANDIDATES, RUNTIME_FILES.publicClient)),
  };
}
