/** SPDX-License-Identifier: MIT */
/**
 * Thin LangGraph adapter for the four public ein-llc 0.3 local MCP tools.
 *
 * Starts the checkout stdio server (`node bin/ein-llc.mjs`) through the
 * official `@langchain/mcp-adapters` MCPAdapter, then binds those tools into
 * a ToolNode graph. No API key and no network are required for the local tools.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AIMessage } from "@langchain/core/messages";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MCPAdapter } from "@langchain/mcp-adapters";

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

export function localStdioServer(repoRoot = defaultRepoRoot()) {
  const bin = resolve(repoRoot, "bin/ein-llc.mjs");
  if (!existsSync(bin)) {
    throw new Error(`ein-llc stdio entry not found at ${bin}. Run this adapter from an ein-llc checkout.`);
  }
  return {
    command: process.execPath,
    args: [bin],
    cwd: repoRoot,
    transport: "stdio",
    // ein-llc 0.3 uses MCP TypeScript SDK 1.32.2, which speaks the legacy protocol.
    mode: "legacy",
    stderr: "pipe",
  };
}

export async function createEinLlcLangGraphAdapter(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot();
  const mcp = new MCPAdapter({
    prefixToolNameWithServerName: false,
    defaultToolTimeout: options.timeoutMs ?? 60_000,
    servers: {
      "ein-llc": localStdioServer(repoRoot),
    },
  });

  try {
    const listed = await mcp.listTools();
    const allowed = new Set(PUBLIC_TOOL_NAMES);
    const tools = listed.filter(tool => allowed.has(tool.name));
    const found = new Set(tools.map(tool => tool.name));
    const missing = PUBLIC_TOOL_NAMES.filter(name => !found.has(name));
    if (missing.length > 0) {
      throw new Error(`Missing public ein-llc tools: ${missing.join(", ")}`);
    }

    const toolNode = new ToolNode(tools);
    const graph = new StateGraph(MessagesAnnotation)
      .addNode("tools", toolNode)
      .addEdge(START, "tools")
      .addEdge("tools", END)
      .compile();

    return {
      mcp,
      tools,
      toolNode,
      graph,
      close: () => mcp.close(),
    };
  } catch (error) {
    await mcp.close().catch(() => {});
    throw error;
  }
}

export async function invokePublicTool(session, name, args, callId = `call_${name}`) {
  if (!PUBLIC_TOOL_NAMES.includes(name)) {
    throw new Error(`Unsupported public tool: ${name}`);
  }
  const result = await session.graph.invoke({
    messages: [
      new AIMessage({
        content: "",
        tool_calls: [{ name, args, id: callId, type: "tool_call" }],
      }),
    ],
  });
  return result.messages.at(-1);
}

export function parseToolContent(message) {
  const content = message?.content;
  if (typeof content === "string") {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }
  return content;
}

export function isToolError(message) {
  if (!message) return false;
  if (message.status === "error") return true;
  const content = typeof message.content === "string" ? message.content : "";
  return content.includes("Local tool execution failed.");
}
