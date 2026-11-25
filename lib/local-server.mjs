import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { authorityInput, verifyAuthority } from "./authority.mjs";
import { deadlinesInput, getDeadlines } from "./deadlines.mjs";
import { createFeeLookup, feeInput } from "./fees.mjs";
import { draftSs4, ss4Input } from "./ss4.mjs";
import feeSnapshot from "./fee-snapshot.json" with { type: "json" };
import metadata from "../package.json" with { type: "json" };

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function createLocalServer() {
  const server = new McpServer({ name: "ein-llc-local", version: metadata.version });
  function register(name, title, description, inputSchema, run) {
    server.registerTool(name, { title, description, inputSchema, annotations }, async input => {
      try {
        const result = await run(input);
        return { structuredContent: result, content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch {
        return { isError: true, content: [{ type: "text", text: "Local tool execution failed." }] };
      }
    });
  }

  register("get_state_fees", "State LLC fees", "Get the dated formation fee for a planned domestic LLC. Calculate ordinary charges through the first anniversary where the audited schedule supports a total.", feeInput, createFeeLookup(feeSnapshot));
  register("draft_ss4", "Draft Form SS-4", "Prepare line entries for a foreign-owned, US disregarded single-member LLC applying for a Form 5472 EIN. Leave taxpayer numbers and signatures for the owner.", ss4Input, draftSs4);
  register("get_compliance_deadlines", "Calculate filing dates", "Calculate ordinary calendar-year Form 5472 and pro forma 1120 filing dates and the Wyoming or Delaware LLC schedule.", deadlinesInput, getDeadlines);
  register("verify_authority_letter", "Verify an authority letter offline", "Check the letter signature, signed dates and listed action against trusted public keys. Live status is unknown.", authorityInput, verifyAuthority);
  return server;
}

export async function startStdio() {
  await createLocalServer().connect(new StdioServerTransport());
}
