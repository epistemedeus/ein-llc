#!/usr/bin/env node
/** SPDX-License-Identifier: MIT */
if (process.argv.length > 2) {
  if (process.argv.length === 3 && process.argv[2] === "--version") process.argv[2] = "version";
  await import("../cli/bin/ein-llc.mjs");
} else {
  const { startBridge } = await import("../lib/bridge.mjs");
  await startBridge("https://ein.llc/mcp");
}
