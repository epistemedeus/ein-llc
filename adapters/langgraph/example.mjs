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
 * LangGraph ToolNode. Under the dated schedule the first-year total is $110.
 */
import {
  createEinLlcLangGraphAdapter,
  DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS,
  invokePublicTool,
  parseToolContent,
} from "./index.mjs";

const session = await createEinLlcLangGraphAdapter();
try {
  const message = await invokePublicTool(session, "get_state_fees", {
    state: "DE",
    formationDate: "2027-05-31",
  });
  const result = parseToolContent(message);
  const cents = result.firstYearStateTotalCents;
  const dollars = (cents / 100).toFixed(0);
  console.log(JSON.stringify({
    tool: "get_state_fees",
    input: { state: "DE", formationDate: "2027-05-31" },
    firstYearStateTotalCents: cents,
    firstYearStateTotalUsd: dollars,
    matchesDatedSchedule: cents === DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS,
  }, null, 2));
  if (cents !== DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS) {
    throw new Error(`Unexpected first-year total: ${cents}`);
  }
} finally {
  await session.close();
}
