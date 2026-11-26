/** SPDX-License-Identifier: MIT */
/**
 * Explicit OpenClaw adapter checks. Not under a test/ directory and not named
 * to match Node's default `node --test` globs, so a root-only npm ci plus
 * unscoped `node --test` will not load them.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  callPublicTool,
  createEinLlcOpenClawAdapter,
  defaultRepoRoot,
  DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS,
  isToolError,
  loadOpenClawMcpConfig,
  parseToolResult,
  PUBLIC_TOOL_NAMES,
  resolveStdioLaunch,
  SERVER_NAME,
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

test("a literal merge of relative cwd into a foreign OpenClaw config fails until cwd is rewritten", async () => {
  const { server } = loadOpenClawMcpConfig();
  const foreignDir = mkdtempSync(join(tmpdir(), "ein-llc-openclaw-merge-"));
  const foreignPath = join(foreignDir, "openclaw.json");
  writeFileSync(foreignPath, JSON.stringify({ mcp: { servers: { [SERVER_NAME]: server } } }, null, 2));

  const failed = resolveStdioLaunch(server, defaultRepoRoot(), foreignPath);
  assert.notEqual(failed.cwd, defaultRepoRoot());
  assert.equal(existsSync(join(failed.cwd, "bin/ein-llc.mjs")), false);

  const recoveredServer = {
    ...server,
    cwd: defaultRepoRoot(),
    args: [join(defaultRepoRoot(), "bin/ein-llc.mjs")],
  };
  const recoveredPath = join(foreignDir, "openclaw.recovered.json");
  writeFileSync(recoveredPath, JSON.stringify({ mcp: { servers: { [SERVER_NAME]: recoveredServer } } }, null, 2));
  const recoveredLaunch = resolveStdioLaunch(recoveredServer, defaultRepoRoot(), recoveredPath);
  assert.equal(recoveredLaunch.cwd, defaultRepoRoot());
  assert.equal(existsSync(recoveredLaunch.args[0]), true);

  const recovered = await createEinLlcOpenClawAdapter({ configPath: recoveredPath });
  try {
    const raw = await callPublicTool(recovered, "get_state_fees", {
      state: "DE",
      formationDate: "2027-05-31",
    });
    assert.equal(isToolError(raw), false);
    assert.equal(parseToolResult(raw).firstYearStateTotalCents, DELAWARE_MAY_31_FIRST_YEAR_TOTAL_CENTS);
  } finally {
    await recovered.close();
  }
});
