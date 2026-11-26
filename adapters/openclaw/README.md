# OpenClaw adapter for ein-llc 0.3 public tools

This package is a thin OpenClaw adapter around the four already-qualified
public local MCP tools in an [ein-llc](https://github.com/epistemedeus/ein-llc)
0.3 checkout:

- `get_state_fees`
- `draft_ss4`
- `get_compliance_deadlines`
- `verify_authority_letter`

It reuses the official OpenClaw
[`mcp.servers` stdio](https://docs.openclaw.ai/tools/mcp) definition and a
checkout-local [skill](https://docs.openclaw.ai/tools/creating-skills). The
adapter loads that config and talks to the existing checkout server
(`node bin/ein-llc.mjs`). It does not reimplement fees, SS-4 drafts, deadlines,
or authority verification, and it does not change the root `package.json` or
package version.

The local tools run over stdio with no network connection, account, or API key.

## Install from a checkout

Use Node.js 22.12 or later. From the repository root, install the existing
ein-llc dependencies, then this adapter's own dependencies:

```sh
npm ci --ignore-scripts
cd adapters/openclaw
npm install
```

Do not add OpenClaw packages to the root Node manifest. The npm package
`ein-llc` is consumed from this git checkout (`node bin/ein-llc.mjs`), not
from a registry install.

## Point OpenClaw at the local server

The checked-in `openclaw.config.json` is a checkout-local official
[`mcp.servers`](https://docs.openclaw.ai/tools/mcp) stdio definition:
`command` is `node`, `args` is `["bin/ein-llc.mjs"]`, and `cwd` is `../..`
(the ein-llc repo root, resolved from this file's directory), plus a
`toolFilter.include` list for the four public tools. The adapter and the
example load that file in place.

Do not paste those relative `cwd` and `args` values into OpenClaw's own
config. OpenClaw resolves `cwd` from its config location, so a literal
merge would point at the wrong directory. Use the official CLI with
absolute checkout paths (adjust to your machine):

```sh
openclaw mcp add ein-llc \
  --command node \
  --arg /path/to/ein-llc/bin/ein-llc.mjs \
  --cwd /path/to/ein-llc
openclaw mcp doctor ein-llc --probe
```

`npm run example` prints the resolved `openclaw mcp add` line for this
checkout. If you copy the `mcp.servers.ein-llc` block by hand, rewrite
`cwd` to the absolute checkout root and keep or absolutize `args` so they
still refer to this checkout's `bin/ein-llc.mjs`, then run
`openclaw mcp doctor ein-llc --probe`.

Load the checkout-local skill with the official local install command
([`openclaw skills install ./path`](https://docs.openclaw.ai/tools/skills)):

```sh
openclaw skills install ./adapters/openclaw/skills/ein-llc-local
```

The skill is invocable as `/ein-llc-local`. It does not start the MCP
server; configure `mcp.servers.ein-llc` first as above.

## Run the no-credential example

```sh
cd adapters/openclaw
npm run example
```

The example starts the checkout stdio server from the official OpenClaw
`mcp.servers` definition, invokes `get_state_fees` with
`{"state":"DE","formationDate":"2027-05-31"}`, and prints the dated first-year
total. Delaware formation on May 31 has a $110 total through the first
anniversary under the dated schedule (`firstYearStateTotalCents` is `11000`).

## Use in code

```js
import {
  callPublicTool,
  createEinLlcOpenClawAdapter,
  parseToolResult,
} from "./index.mjs";

const session = await createEinLlcOpenClawAdapter();
try {
  const raw = await callPublicTool(session, "get_state_fees", {
    state: "DE",
    formationDate: "2027-05-31",
  });
  console.log(parseToolResult(raw));
} finally {
  await session.close();
}
```

`createEinLlcOpenClawAdapter()` launches `node bin/ein-llc.mjs` from the
checkout root. No credentials are required for these four local tools. An
optional OpenClaw agent turn can use the same `mcp.servers` entry; that step
is outside this example and would need its own model credentials.

An invalid date such as `2027-02-29` is refused by the existing
`get_state_fees` input schema (2027 is not a leap year). The MCP client
surfaces that refusal as MCP error `-32602` with `Invalid ISO date at
formationDate`.

## Checks

Adapter checks live at `checks/adapter.checks.mjs`, outside Node's default
`node --test` globs, so a root-only `npm ci` followed by the root `npm test`
(`node --test`) does not load them. The root package does not install this
adapter's extra client dependency. Run the checks from this directory after
`npm install` here:

```sh
cd adapters/openclaw
npm test
```

That script runs `node --test checks/adapter.checks.mjs` explicitly. The
checks make a real stdio call for the Delaware May 31 case and assert the
existing invalid-date refusal. They do not invent fees or require a network
account.

## Ownership

This directory owns only `adapters/openclaw/**`. Root package manifests and
version fields stay unchanged while 0.3 is published.
