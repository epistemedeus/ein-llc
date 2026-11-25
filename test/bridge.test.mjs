import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { test } from "node:test";

const protocolVersion = "2025-11-25";
const tools = [{ name: "public_read", inputSchema: { type: "object" } }];

test("stdio MCP streams list and reads, then recovers without replaying a failed call", { timeout: 15000 }, async (t) => {
  const seen = { initialize: 0, streamed: 0, attempts: 0, deletes: 0, redirected: 0 };
  const upstream = createServer(async (req, res) => {
    if (req.url === "/other") {
      seen.redirected++;
      return res.writeHead(500).end();
    }
    if (req.method === "GET") return res.writeHead(405).end();
    if (req.method === "DELETE") {
      seen.deletes++;
      return res.writeHead(204).end();
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const { method, id, params } = JSON.parse(body);
    const send = (result) => ({ jsonrpc: "2.0", id, result });
    if (method === "initialize") {
      const session = "fixture-" + ++seen.initialize;
      return res.writeHead(200, { "content-type": "application/json", "mcp-session-id": session })
        .end(JSON.stringify(send({ protocolVersion, capabilities: { tools: {} },
          serverInfo: { name: "fixture", version: "1.0.0" } })));
    }
    if (method === "notifications/initialized") return res.writeHead(202).end();

    if (method === "tools/list") {
      seen.streamed++;
      return res.writeHead(200, { "content-type": "text/event-stream" })
        .end("event: message\ndata: " + JSON.stringify(send({ tools })) + "\n\n");
    }
    if (params?.name === "fixture_unknown_outcome") {
      seen.attempts++;
      return req.socket.destroy();
    }
    if (params?.name === "fixture_redirect") {
      return res.writeHead(307, { location: "/other" }).end();
    }
    if (params?.name === "fixture_forbidden") return res.writeHead(401).end();
    return res.writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify(send({ content: [{ type: "text", text: "public fixture data" }] })));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + upstream.address().port + "/mcp";
  const bridge = new URL("../lib/bridge.mjs", import.meta.url).href;
  const child = spawn(process.execPath, ["--input-type=module", "-e",
    'import { startBridge } from ' + JSON.stringify(bridge) + '; await startBridge(' + JSON.stringify(url) + ')'],
  { stdio: ["pipe", "pipe", "pipe"] });

  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    upstream.closeAllConnections();
    upstream.close();
  });
  const closed = once(child, "close");
  const stdout = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let id = 0;
  async function request(method, params) {
    const current = ++id;
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: current, method, params }) + "\n");
    const line = await stdout.next();
    assert.equal(line.done, false, "received JSON-RPC response");
    const response = JSON.parse(line.value);
    assert.equal(response.id, current);
    return response;
  }
  const initialized = await request("initialize", { protocolVersion, capabilities: {},
    clientInfo: { name: "stdio-test", version: "1.0.0" } });
  assert.equal(initialized.result.serverInfo.name, "fixture");
  assert.equal(initialized.result.protocolVersion, protocolVersion);
  child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  assert.deepEqual((await request("tools/list", {})).result.tools, tools);
  assert.equal((await request("tools/call", { name: "public_read" })).result.content[0].text, "public fixture data");
  assert.ok((await request("tools/call", { name: "fixture_unknown_outcome" })).error);
  assert.deepEqual((await request("tools/list", {})).result.tools, tools);
  assert.equal(seen.initialize, 2);
  assert.ok((await request("tools/call", { name: "fixture_redirect" })).error);
  assert.ok((await request("tools/call", { name: "fixture_forbidden" })).error);
  assert.equal(seen.attempts, 1);
  assert.equal(seen.redirected, 0);
  assert.equal(seen.streamed, 2);
  child.kill("SIGTERM");
  assert.deepEqual(await closed, [0, null]);
  assert.equal(seen.deletes, 1);
});

test("wrapper delegates unchanged CLI output and exit status", () => {
  function run(path, args) {
    const { status, stdout, stderr } = spawnSync(process.execPath, [path, ...args], { encoding: "utf8" });
    return { status, stdout, stderr };
  }
  for (const args of [["--help"], ["version"], ["capabilities", "--offline"], ["--invalid-flag"]]) {
    assert.deepEqual(run("bin/ein-llc.mjs", args), run("cli/bin/ein-llc.mjs", args));
  }
  const version = run("bin/ein-llc.mjs", ["--version"]);
  assert.equal(version.status, 0);
  assert.equal(JSON.parse(version.stdout).data.cli, "0.2.2");
});
