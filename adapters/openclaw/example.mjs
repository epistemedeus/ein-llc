/** SPDX-License-Identifier: MIT */
/**
 * No-credential install/use example.
 *
 * From an ein-llc checkout, after `npm ci --ignore-scripts` at the repo root
 * and `npm install` in this directory:
 *
 *   node example.mjs
 *
 * Loads the official OpenClaw mcp.servers stdio definition and calls
 * get_state_fees for a Delaware formation on 2027-05-31. Under the dated
 * schedule the first-year total is $110.
 */
import {
  callPublicTool,
  createEinLlcOpenClawAdapter,
  DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS,
  parseToolResult,
} from "./index.mjs";

const session = await createEinLlcOpenClawAdapter();
try {
  const raw = await callPublicTool(session, "get_state_fees", {
    state: "DE",
    formationDate: "2027-05-31",
  });
  const result = parseToolResult(raw);
  const cents = result.firstYearStateTotalCents;
  const { command, args, cwd } = session.launch;
  console.log(JSON.stringify({
    tool: "get_state_fees",
    input: { state: "DE", formationDate: "2027-05-31" },
    firstYearStateTotalCents: cents,
    firstYearStateTotalUsd: String(Math.trunc(cents / 100)),
    matchesDatedSchedule: cents === DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS,
    openclawLaunch: { command, args, cwd },
    openclawMcpAdd: [
      "openclaw mcp add ein-llc",
      `--command ${command}`,
      ...args.map(arg => `--arg ${arg}`),
      `--cwd ${cwd}`,
    ].join(" "),
  }, null, 2));
  if (cents !== DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS) {
    throw new Error(`Unexpected first-year total: ${cents}`);
  }
} finally {
  await session.close();
}
