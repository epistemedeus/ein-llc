import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createLocalServer as createServer, startStdio as start } from "./lib/local-server.mjs";

/** Create an account-free MCP server for use with a local transport. */
export function createLocalServer(): McpServer {
  return createServer();
}

/** Start the server on standard input and output. */
export function startStdio(): Promise<void> {
  return start();
}

if (import.meta.main) await startStdio();
