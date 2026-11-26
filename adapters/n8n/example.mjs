/** SPDX-License-Identifier: MIT */
/**
 * No-credential install/use example.
 *
 * From an ein-llc checkout, after `npm ci --ignore-scripts` at the repo root
 * and `npm install` in this directory:
 *
 *   node example.mjs
 *
 * Calls get_state_fees for a Delaware formation on 2027-05-31 through the
 * same STDIO Client + callTool path used by the n8n-nodes-mcp MCP Client
 * node. Under the dated schedule the first-year total is $110.
 */
import {
  createEinLlcN8nAdapter,
  DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS,
  invokePublicTool,
  parseToolContent,
} from "./index.mjs";

const session = await createEinLlcN8nAdapter();
try {
  const raw = await invokePublicTool(session, "get_state_fees", {
    state: "DE",
    formationDate: "2027-05-31",
  });
  const result = parseToolContent(raw);
  const cents = result.firstYearStateTotalCents;
  const dollars = (cents / 100).toFixed(0);
  console.log(JSON.stringify({
    tool: "get_state_fees",
    input: { state: "DE", formationDate: "2027-05-31" },
    firstYearStateTotalCents: cents,
    firstYearStateTotalUsd: dollars,
    matchesDatedSchedule: cents === DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS,
    n8nConnectionType: session.connectionType,
    n8nCredentialCommand: session.credentials.command,
    n8nCredentialArgs: session.credentials.args,
  }, null, 2));
  if (cents !== DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS) {
    throw new Error(`Unexpected first-year total: ${cents}`);
  }
} finally {
  await session.close();
}
