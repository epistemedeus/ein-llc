/** SPDX-License-Identifier: MIT */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  createEinLlcN8nAdapter,
  DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS,
  invokePublicTool,
  isToolError,
  parseToolContent,
  PUBLIC_TOOL_NAMES,
  schemaRefusalText,
} from "../index.mjs";

const session = await createEinLlcN8nAdapter();
after(async () => {
  await session.close();
});

test("binds the four public ein-llc tools through the n8n MCP Client STDIO path", () => {
  assert.deepEqual(session.tools.map((tool) => tool.name).sort(), [...PUBLIC_TOOL_NAMES].sort());
  assert.equal(session.connectionType, "cmd");
  for (const tool of session.tools) {
    assert.equal(typeof tool.schema, "object");
  }
});

test("no-credential get_state_fees for Delaware formation on 2027-05-31 is $110", async () => {
  const raw = await invokePublicTool(session, "get_state_fees", {
    state: "DE",
    formationDate: "2027-05-31",
  });
  assert.equal(isToolError(raw), false);
  const result = parseToolContent(raw);
  assert.equal(result.firstYearStateTotalCents, DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS);
  assert.deepEqual(result.firstYear.window, {
    from: "2027-05-31",
    through: "2028-05-31",
    inclusive: true,
  });
});

test("invalid formationDate 2027-02-29 is refused by the existing tool schema", async () => {
  let outcome;
  let threw = false;
  try {
    outcome = await invokePublicTool(session, "get_state_fees", {
      state: "DE",
      formationDate: "2027-02-29",
    });
  } catch (error) {
    threw = true;
    outcome = error;
  }
  const text = schemaRefusalText(outcome);
  assert.equal(threw || isToolError(outcome), true);
  if (!threw) {
    assert.equal(outcome.isError, true);
  }
  assert.match(text, /Invalid ISO date|Invalid arguments|did not match expected schema/i);
});
