/** SPDX-License-Identifier: MIT */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  createEinLlcLangGraphAdapter,
  DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS,
  invokePublicTool,
  isToolError,
  parseToolContent,
  PUBLIC_TOOL_NAMES,
} from "../index.mjs";

const session = await createEinLlcLangGraphAdapter();
after(async () => {
  await session.close();
});

test("binds the four public ein-llc tools into a LangGraph ToolNode", () => {
  assert.deepEqual(session.tools.map(tool => tool.name).sort(), [...PUBLIC_TOOL_NAMES].sort());
});

test("no-credential get_state_fees for Delaware formation on 2027-05-31 is $110", async () => {
  const message = await invokePublicTool(session, "get_state_fees", {
    state: "DE",
    formationDate: "2027-05-31",
  });
  assert.equal(isToolError(message), false);
  const result = parseToolContent(message);
  assert.equal(result.firstYearStateTotalCents, DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS);
  assert.deepEqual(result.firstYear.window, {
    from: "2027-05-31",
    through: "2028-05-31",
    inclusive: true,
  });
});

test("invalid formationDate 2027-02-29 is refused by the existing tool schema", async () => {
  const message = await invokePublicTool(session, "get_state_fees", {
    state: "DE",
    formationDate: "2027-02-29",
  }, "call_invalid_date");
  assert.equal(message.status, "error");
  assert.equal(isToolError(message), true);
  const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
  assert.match(content, /did not match expected schema/);
});
