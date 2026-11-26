/** SPDX-License-Identifier: MIT */
/**
 * Thin Vercel AI SDK adapter for the four public ein-llc 0.3 local MCP tools.
 *
 * Starts the checkout stdio server (`node bin/ein-llc.mjs`) through the
 * official `@ai-sdk/mcp` createMCPClient + StdioMCPTransport, then exposes
 * those tools as AI SDK tools for generateText or direct execute. No API key
 * and no network are required for the local tools.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMCPClient } from "@ai-sdk/mcp";
import { StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";

export const PUBLIC_TOOL_NAMES = Object.freeze([
  "get_state_fees",
  "draft_ss4",
  "get_compliance_deadlines",
  "verify_authority_letter",
]);

/** Documented no-credential Delaware first-year total under the dated schedule. */
export const DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS = 11000;

export function adapterDirectory() {
  return dirname(fileURLToPath(import.meta.url));
}

export function defaultRepoRoot() {
  return resolve(adapterDirectory(), "../..");
}

export function localStdioTransportOptions(repoRoot = defaultRepoRoot()) {
  const bin = resolve(repoRoot, "bin/ein-llc.mjs");
  if (!existsSync(bin)) {
    throw new Error(`ein-llc stdio entry not found at ${bin}. Run this adapter from an ein-llc checkout.`);
  }
  return {
    command: process.execPath,
    args: [bin],
    cwd: repoRoot,
    stderr: "pipe",
  };
}

export async function createEinLlcVercelAiAdapter(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot();
  const transport = new StdioMCPTransport(localStdioTransportOptions(repoRoot));
  const client = await createMCPClient({ transport });

  try {
    const listed = await client.tools();
    const missing = PUBLIC_TOOL_NAMES.filter((name) => !(name in listed));
    if (missing.length > 0) {
      throw new Error(`Missing public ein-llc tools: ${missing.join(", ")}`);
    }
    const tools = Object.fromEntries(
      PUBLIC_TOOL_NAMES.map((name) => [name, listed[name]]),
    );

    return {
      client,
      tools,
      close: () => client.close(),
    };
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

export async function invokePublicTool(session, name, args, callId = `call_${name}`) {
  if (!PUBLIC_TOOL_NAMES.includes(name)) {
    throw new Error(`Unsupported public tool: ${name}`);
  }
  const tool = session.tools[name];
  if (typeof tool?.execute !== "function") {
    throw new Error(`AI SDK tool ${name} has no execute method`);
  }
  return tool.execute(args, { toolCallId: callId, messages: [] });
}

export function parseToolContent(result) {
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }
  if (Array.isArray(result)) {
    const text = result
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
    if (text) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
  }
  if (result && typeof result === "object") {
    if (typeof result.text === "string") {
      try {
        return JSON.parse(result.text);
      } catch {
        return result.text;
      }
    }
    if (typeof result.content === "string") {
      try {
        return JSON.parse(result.content);
      } catch {
        return result.content;
      }
    }
  }
  return result;
}

export function isToolError(result) {
  if (!result) return false;
  if (result instanceof Error) return true;
  if (result?.isError === true) return true;
  if (typeof result?.type === "string" && /error/i.test(result.type)) return true;
  const text = typeof result === "string"
    ? result
    : typeof result?.text === "string"
      ? result.text
      : typeof result?.content === "string"
        ? result.content
        : "";
  return /did not match expected schema|invalid|error/i.test(text) && /2027-02-29|schema|date/i.test(text);
}

export function schemaRefusalText(errorOrResult) {
  if (errorOrResult instanceof Error) {
    return errorOrResult.message + (errorOrResult.cause ? ` ${errorOrResult.cause}` : "");
  }
  if (typeof errorOrResult === "string") return errorOrResult;
  try {
    return JSON.stringify(errorOrResult);
  } catch {
    return String(errorOrResult);
  }
}
