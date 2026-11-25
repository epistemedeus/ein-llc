/** SPDX-License-Identifier: MIT
 * ein-llc entry: parse, run one command, write one envelope.
 * stdout: exactly one JSON line (or plain help text for bare `help`).
 * stderr: diagnostics only. Never prompts. Exit codes: see errors.mjs EXIT.
 */
import { CliError, EXIT, exitCodeOf, toPublicError } from "./errors.mjs";
import { handlerFor } from "./commands.mjs";
import { publicClient } from "./locate.mjs";
import { ENVELOPE_SCHEMA_VERSION } from "./manifest.mjs";
import { parseArgv } from "./parse.mjs";

export const MAX_STDOUT_BYTES = 8 * 1024 * 1024;
const DEFAULT_ORIGIN = "https://ein.llc";
const LOCAL_COMMANDS = new Set(["help", "version", "schema"]);

function write(stream, text) {
  try {
    stream.write(text);
  } catch {
    // A closed consumer must not turn into a crash; the bin handles EPIPE.
  }
}

function envelope(fields) {
  return { schemaVersion: ENVELOPE_SCHEMA_VERSION, ...fields };
}

export async function runCli(argv, io = {}) {
  const {
    env = {},
    stdin,
    stdout,
    stderr,
    fetch: fetchImpl = globalThis.fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = io;
  const diagnostic = (line) => write(stderr, `ein-llc: ${line}\n`);

  let parsed = null;
  let pub = null;
  let correlationId;
  // Credential values seen during this run (the status grant). Every byte
  // written to stdout or stderr is redacted against them.
  const secrets = [];
  const redact = (text) => (pub?.redact?.redactString ? pub.redact.redactString(text, secrets) : String(text));
  try {
    parsed = parseArgv(argv);
    const { entry, global, flags } = parsed;
    correlationId = global["correlation-id"];
    const handler = handlerFor(entry);
    const needsNetworkContext = !LOCAL_COMMANDS.has(entry.command) && !(entry.command === "capabilities" && flags.offline);
    let origin = null;
    if (needsNetworkContext) {
      pub = await publicClient();
      origin = pub.http.parseOrigin(global.origin ?? env.EIN_LLC_ORIGIN ?? DEFAULT_ORIGIN);
    }
    const ctx = {
      pub,
      origin,
      fetch: fetchImpl,
      timeoutMs: global["timeout-ms"] ?? 15_000,
      maxResponseBytes: global["max-response-bytes"] ?? 1024 * 1024,
      retries: global.retries ?? 0,
      sleep,
      stdin,
      env,
      secrets,
      diagnostic,
    };
    const result = await handler(ctx, parsed);
    if (result.text !== undefined) {
      write(stdout, result.text);
      return EXIT.ok;
    }
    const body = redact(`${JSON.stringify(
      envelope({
        ok: true,
        command: entry.command,
        operationId: result.operationId ?? entry.operationId ?? null,
        ...(result.origin ? { origin: result.origin } : {}),
        ...(correlationId ? { correlationId } : {}),
        data: result.data,
        ...(result.next ? { next: result.next } : {}),
      }),
    )}\n`);
    if (Buffer.byteLength(body, "utf8") > MAX_STDOUT_BYTES) {
      throw new CliError({ code: "output_limit", message: "result exceeds the 8 MiB output bound" });
    }
    write(stdout, body);
    return EXIT.ok;
  } catch (error) {
    const readOnly = parsed?.entry?.effect === "read_only";
    const publicError = toPublicError(error, { readOnly, redact });
    write(
      stdout,
      redact(`${JSON.stringify(
        envelope({
          ok: false,
          command: parsed?.entry?.command ?? null,
          operationId: parsed?.entry?.operationId ?? null,
          ...(correlationId ? { correlationId } : {}),
          error: publicError,
        }),
      )}\n`),
    );
    diagnostic(redact(`${publicError.code}: ${publicError.message}`));
    return exitCodeOf(publicError.code);
  }
}
