/** SPDX-License-Identifier: MIT
 * Bounded JSON input from stdin or --input FILE. Never prompts.
 */
import { readFile, stat } from "node:fs/promises";

import { CliError } from "./errors.mjs";

export const MAX_INPUT_BYTES = 32 * 1024;

export async function readStdinBounded(stdin) {
  if (!stdin || stdin.isTTY) {
    throw new CliError({ code: "missing_input", message: "expected JSON on stdin or --input FILE" });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of stdin) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buf.length;
    if (size > MAX_INPUT_BYTES) throw new CliError({ code: "body_limit", message: "input exceeds 32 KiB" });
    chunks.push(buf);
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

export async function readInputFile(file) {
  let info;
  try {
    info = await stat(file);
  } catch {
    throw new CliError({ code: "missing_input", field: "input", message: "--input file cannot be read" });
  }
  if (!info.isFile()) throw new CliError({ code: "invalid_input", field: "input", message: "--input must be a regular file" });
  if (info.size > MAX_INPUT_BYTES) throw new CliError({ code: "body_limit", field: "input", message: "input exceeds 32 KiB" });
  return readFile(file, "utf8");
}

/** Read and parse one JSON object. */
export async function readJsonObject(ctx, flags) {
  const raw = flags.input ? await readInputFile(flags.input) : await readStdinBounded(ctx.stdin);
  if (!raw.trim()) throw new CliError({ code: "missing_input", message: "input is empty" });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new CliError({ code: "invalid_input", message: "input is not valid JSON" });
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new CliError({ code: "invalid_input", message: "input must be a JSON object" });
  }
  return body;
}
