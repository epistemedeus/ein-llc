/** SPDX-License-Identifier: MIT */
/**
 * Explicit OpenClaw adapter checks. Not under a test/ directory and not named
 * to match Node's default `node --test` globs, so a root-only npm ci plus
 * unscoped `node --test` will not load them.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  callPublicTool,
  createEinLlcOpenClawAdapter,
  DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS,
  isToolError,
  parseToolResult,
  PUBLIC_TOOL_NAMES,
} from "../index.mjs";

const session = await createEinLlcOpenClawAdapter();
after(async () => {
  await session.close();
});

test("binds the four public ein-llc tools from the OpenClaw mcp.servers definition", () => {
  assert.deepEqual(session.tools.map(tool => tool.name).sort(), [...PUBLIC_TOOL_NAMES].sort());
});

test("no-credential get_state_fees for Delaware formation on 2027-05-31 is $110", async () => {
  const raw = await callPublicTool(session, "get_state_fees", {
    state: "DE",
    formationDate: "2027-05-31",
  });
  assert.equal(isToolError(raw), false);
  const result = parseToolResult(raw);
  assert.equal(result.firstYearStateTotalCents, DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS);
  assert.deepEqual(result.firstYear.window, {
    from: "2027-05-31",
    through: "2028-05-31",
    inclusive: true,
  });
});

test("invalid formationDate 2027-02-29 is refused by the existing tool schema", async () => {
  const raw = await callPublicTool(session, "get_state_fees", {
    state: "DE",
    formationDate: "2027-02-29",
  });
  assert.equal(isToolError(raw), true);
  const content = raw.content?.map(part => part.type === "text" ? part.text : "").join("\n") ?? "";
  assert.match(content, /Invalid ISO date at formationDate|-32602/);
});
