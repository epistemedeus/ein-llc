/** SPDX-License-Identifier: MIT */
import { fileURLToPath } from "node:url";

const gateway = new URL("dist/index.js", import.meta.resolve("supergateway/package.json"));

export async function startBridge(url) {
  const endpoint = new URL(url).href;
  const fetch = globalThis.fetch;
  globalThis.fetch = (input, options) => {
    const target = input instanceof Request ? input.url : new URL(input).href;
    if (target !== endpoint) throw new Error("Unexpected MCP destination");
    return fetch(input, { ...options, redirect: "error" });
  };

  // Run the gateway in this process so stdin and process signals reach its
  // own stdio transport and upstream session cleanup.
  process.argv.splice(1, Infinity, fileURLToPath(gateway),
    "--streamableHttp", endpoint, "--outputTransport", "stdio", "--logLevel", "none");
  await import(gateway.href);
}
