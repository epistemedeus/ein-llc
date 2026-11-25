#!/usr/bin/env node
/** SPDX-License-Identifier: MIT */
import { runCli } from "../src/cli.mjs";

// A closed stdout consumer (for example `| head -1`) must not produce a stack trace.
process.stdout.on("error", (error) => {
  if (error && error.code === "EPIPE") process.exit(process.exitCode ?? 0);
  throw error;
});

try {
  process.exitCode = await runCli(process.argv.slice(2), {
    env: process.env,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    fetch: globalThis.fetch,
  });
} catch {
  process.stderr.write("ein-llc: internal_error: unexpected failure\n");
  process.exitCode = 1;
}
