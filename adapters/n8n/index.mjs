/** SPDX-License-Identifier: MIT */
/**
 * Thin n8n adapter for the four public ein-llc 0.3 local MCP tools.
 *
 * Reuses the maintained community `n8n-nodes-mcp` MCP Client node's
 * Command Line (STDIO) wiring (Client + StdioClientTransport + listTools
 * + callTool from `@modelcontextprotocol/sdk`). Starts the checkout
 * stdio server (`node bin/ein-llc.mjs`). No API key and no network are
 * required for the local tools.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

export const PUBLIC_TOOL_NAMES = Object.freeze([
  "get_state_fees",
  "draft_ss4",
  "get_compliance_deadlines",
  "verify_authority_letter",
]);

/** Documented no-credential Delaware first-year total under the dated schedule. */
export const DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS = 11000;

/** Display name of the n8n-nodes-mcp STDIO credential type. */
export const N8N_MCP_STDIO_CREDENTIAL = "mcpClientApi";

/** n8n-nodes-mcp connectionType value for Command Line (STDIO). */
export const N8N_MCP_CONNECTION_TYPE_STDIO = "cmd";

export function adapterDirectory() {
  return dirname(fileURLToPath(import.meta.url));
}

export function defaultRepoRoot() {
  return resolve(adapterDirectory(), "../..");
}

/**
 * Credential fields for the n8n-nodes-mcp "MCP Client (STDIO) API"
 * credential, matching McpClientApi: command, args, environments.
 */
export function n8nStdioCredentials(repoRoot = defaultRepoRoot()) {
  const bin = resolve(repoRoot, "bin/ein-llc.mjs");
  if (!existsSync(bin)) {
    throw new Error(`ein-llc stdio entry not found at ${bin}. Run this adapter from an ein-llc checkout.`);
  }
  return {
    command: process.execPath,
    args: bin,
    environments: "",
  };
}

export function localStdioTransportOptions(repoRoot = defaultRepoRoot()) {
  const credentials = n8nStdioCredentials(repoRoot);
  return {
    command: credentials.command,
    // n8n-nodes-mcp splits the credential args string on spaces.
    args: credentials.args.split(" ").filter(Boolean),
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH || "",
    },
    stderr: "pipe",
  };
}

function normalizeToolList(rawTools) {
  if (Array.isArray(rawTools)) return rawTools;
  if (Array.isArray(rawTools?.tools)) return rawTools.tools;
  if (rawTools?.tools && typeof rawTools.tools === "object") {
    return Object.values(rawTools.tools);
  }
  return [];
}

export async function createEinLlcN8nAdapter(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot();
  const timeoutMs = options.timeoutMs ?? 60_000;
  const transport = new StdioClientTransport(localStdioTransportOptions(repoRoot));
  const client = new Client(
    {
      name: "McpClient-client",
      version: "1.0.0",
    },
    {
      capabilities: {
        prompts: {},
        resources: {},
        tools: {},
      },
    },
  );

  try {
    await client.connect(transport);
    const rawTools = await client.listTools();
    const listed = normalizeToolList(rawTools);
    const tools = listed
      .filter((tool) => PUBLIC_TOOL_NAMES.includes(tool.name))
      .map((tool) => ({
        name: tool.name,
        description: tool.description || `Execute the ${tool.name} tool`,
        schema: tool.inputSchema,
      }));
    const found = new Set(tools.map((tool) => tool.name));
    const missing = PUBLIC_TOOL_NAMES.filter((name) => !found.has(name));
    if (missing.length > 0) {
      throw new Error(`Missing public ein-llc tools: ${missing.join(", ")}`);
    }

    return {
      client,
      transport,
      tools,
      credentials: n8nStdioCredentials(repoRoot),
      connectionType: N8N_MCP_CONNECTION_TYPE_STDIO,
      timeoutMs,
      close: async () => {
        await client.close().catch(() => {});
      },
    };
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

export async function invokePublicTool(session, name, args) {
  if (!PUBLIC_TOOL_NAMES.includes(name)) {
    throw new Error(`Unsupported public tool: ${name}`);
  }
  const toolExists = session.tools.some((tool) => tool.name === name);
  if (!toolExists) {
    throw new Error(`Tool '${name}' does not exist.`);
  }
  return session.client.callTool(
    { name, arguments: args },
    CallToolResultSchema,
    { timeout: session.timeoutMs ?? 60_000 },
  );
}

export function parseToolContent(result) {
  if (result && typeof result === "object" && result.structuredContent != null) {
    return result.structuredContent;
  }
  const parts = Array.isArray(result) ? result : result?.content;
  if (Array.isArray(parts)) {
    const text = parts
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
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }
  return result;
}

export function isToolError(result) {
  if (!result) return false;
  if (result instanceof Error) return true;
  if (result.isError === true) return true;
  return false;
}

export function schemaRefusalText(errorOrResult) {
  if (errorOrResult instanceof Error) {
    const cause = errorOrResult.cause ? ` ${errorOrResult.cause}` : "";
    return `${errorOrResult.message}${cause}`;
  }
  if (typeof errorOrResult === "string") return errorOrResult;
  try {
    return JSON.stringify(errorOrResult);
  } catch {
    return String(errorOrResult);
  }
}
