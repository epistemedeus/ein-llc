/** SPDX-License-Identifier: MIT */
/**
 * Thin OpenClaw adapter for the four public ein-llc 0.3 local MCP tools.
 *
 * Loads the official OpenClaw `mcp.servers` stdio definition in
 * openclaw.config.json and connects to the checkout server
 * (`node bin/ein-llc.mjs`) the same way OpenClaw probe and embedded runtimes
 * launch a local stdio server. No API key and no network are required for
 * the local tools.
 */
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export const PUBLIC_TOOL_NAMES = Object.freeze([
  "get_state_fees",
  "draft_ss4",
  "get_compliance_deadlines",
  "verify_authority_letter",
]);

export const SERVER_NAME = "ein-llc";

/** Documented no-credential Delaware first-year total under the dated schedule. */
export const DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS = 11000;

export function adapterDirectory() {
  return dirname(fileURLToPath(import.meta.url));
}

export function defaultRepoRoot() {
  return resolve(adapterDirectory(), "../..");
}

export function openClawConfigPath() {
  return resolve(adapterDirectory(), "openclaw.config.json");
}

export function loadOpenClawMcpConfig(configPath = openClawConfigPath()) {
  const parsed = JSON.parse(readFileSync(configPath, "utf8"));
  const server = parsed?.mcp?.servers?.[SERVER_NAME];
  if (!server) {
    throw new Error(`OpenClaw mcp.servers.${SERVER_NAME} is missing in ${configPath}`);
  }
  if (server.transport && server.transport !== "stdio") {
    throw new Error(`Expected stdio transport for ${SERVER_NAME}, got ${server.transport}`);
  }
  if (!server.command) {
    throw new Error(`OpenClaw mcp.servers.${SERVER_NAME} needs a stdio command`);
  }
  return { configPath, parsed, server };
}

export function includedToolNames(server) {
  const include = server?.toolFilter?.include;
  if (Array.isArray(include) && include.length > 0) {
    return include;
  }
  return [...PUBLIC_TOOL_NAMES];
}

/**
 * Resolve a stdio launch from an mcp.servers block. Relative `cwd` is
 * resolved against the given config file's directory so the checkout-local
 * `openclaw.config.json` works when this adapter loads it in place. That
 * is this adapter's helper, not a proven OpenClaw config-dir semantic.
 * Prefer absolute checkout `cwd` and `args` when configuring OpenClaw.
 */
export function resolveStdioLaunch(server, repoRoot = defaultRepoRoot(), configPath = openClawConfigPath()) {
  const configDir = dirname(configPath);
  const cwd = server.cwd
    ? (isAbsolute(server.cwd) ? server.cwd : resolve(configDir, server.cwd))
    : repoRoot;
  const command = server.command === "node" ? process.execPath : server.command;
  const args = Array.isArray(server.args) ? server.args.map(arg => (
    !isAbsolute(arg) && arg.includes("/") ? resolve(cwd, arg) : arg
  )) : [];
  return { command, args, cwd };
}

export async function createEinLlcOpenClawAdapter(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot();
  const { configPath, parsed, server } = loadOpenClawMcpConfig(options.configPath);
  const launch = resolveStdioLaunch(server, repoRoot, configPath);
  const allowed = includedToolNames(server);
  const transport = new StdioClientTransport({
    command: launch.command,
    args: launch.args,
    cwd: launch.cwd,
    stderr: "pipe",
  });
  const client = new Client({ name: "ein-llc-openclaw-adapter", version: "0.0.0" });
  try {
    await client.connect(transport, { timeout: options.timeoutMs ?? 60_000 });
    const listed = await client.listTools();
    const tools = listed.tools.filter(tool => allowed.includes(tool.name));
    const found = new Set(tools.map(tool => tool.name));
    const missing = PUBLIC_TOOL_NAMES.filter(name => !found.has(name));
    if (missing.length > 0) {
      throw new Error(`Missing public ein-llc tools: ${missing.join(", ")}`);
    }
    return {
      client,
      tools,
      server,
      config: parsed,
      launch,
      close: () => client.close(),
    };
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

export async function callPublicTool(session, name, args) {
  if (!PUBLIC_TOOL_NAMES.includes(name)) {
    throw new Error(`Unsupported public tool: ${name}`);
  }
  return session.client.callTool({ name, arguments: args });
}

export function parseToolResult(result) {
  if (result?.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }
  const text = result?.content?.find(part => part.type === "text")?.text;
  if (typeof text === "string") {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return result;
}

export function isToolError(result) {
  return result?.isError === true;
}
