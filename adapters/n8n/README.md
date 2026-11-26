# n8n adapter for ein-llc 0.3 public tools

This package is a thin [n8n](https://n8n.io) adapter around the four
already-qualified public local MCP tools in an
[ein-llc](https://github.com/epistemedeus/ein-llc) 0.3 checkout:

- `get_state_fees`
- `draft_ss4`
- `get_compliance_deadlines`
- `verify_authority_letter`

n8n's built-in [MCP Client Tool](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolmcp/)
node speaks SSE and streamable HTTP, not local STDIO. For a checkout stdio
server, this adapter reuses the maintained community
[`n8n-nodes-mcp`](https://www.npmjs.com/package/n8n-nodes-mcp) MCP Client
node's Command Line (STDIO) path: `@modelcontextprotocol/sdk`
`Client`, `StdioClientTransport`, `listTools`, and `callTool`, as in
that node's `McpClient` implementation. It does not reimplement fees,
SS-4 drafts, deadlines, or authority verification, and it does not change
the root `package.json` or package version.

The local tools run over stdio with no network connection, account, or API key.

## Install from a checkout

Use Node.js 22.12 or later. From the repository root, install the existing
ein-llc dependencies, then this adapter's own dependencies:

```sh
npm ci --ignore-scripts
cd adapters/n8n
npm install
```

Do not add n8n or MCP packages to the root manifest. The npm package
`ein-llc` is consumed from this git checkout (`node bin/ein-llc.mjs`), not
from a registry install.

## Run the no-credential example

```sh
cd adapters/n8n
npm run example
```

The example starts the checkout stdio server, invokes `get_state_fees`
through the same STDIO `callTool` path as the n8n MCP Client node with
`{"state":"DE","formationDate":"2027-05-31"}`, and prints the dated
first-year total. Delaware formation on May 31 has a $110 total through
the first anniversary under the dated schedule
(`firstYearStateTotalCents` is `11000`).

## Use in an n8n workflow

1. Install the [`n8n-nodes-mcp`](https://www.npmjs.com/package/n8n-nodes-mcp)
   community node in your n8n instance
   ([installation guide](https://docs.n8n.io/integrations/community-nodes/installation/)).
2. Create an **MCP Client (STDIO) API** credential (`mcpClientApi`):
   - **Command**: your Node.js binary (`node`, or the absolute path printed
     by the example as `n8nCredentialCommand`)
   - **Arguments**: the absolute path to this checkout's `bin/ein-llc.mjs`
     (the example prints it as `n8nCredentialArgs`)
3. Add an **MCP Client** node (`n8n-nodes-mcp.mcpClient`), set
   **Connection Type** to **Command Line (STDIO)**, and choose
   **List Tools** or **Execute Tool**.
4. Optionally import `workflow.ein-llc-public-tools.json` from this
   directory, then point the credential at your checkout.

To use the same node as a tool on an AI Agent, set
`N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` as documented by
`n8n-nodes-mcp`.

## Use in code

```js
import {
  createEinLlcN8nAdapter,
  invokePublicTool,
  parseToolContent,
} from "./index.mjs";

const session = await createEinLlcN8nAdapter();
try {
  const result = parseToolContent(
    await invokePublicTool(session, "get_state_fees", {
      state: "DE",
      formationDate: "2027-05-31",
    }),
  );
  console.log(result);
  // session.tools is the four public tools as listTools schema objects.
  // session.credentials holds the n8n-nodes-mcp STDIO credential fields.
  // Keep the session open while tools run, then close it.
} finally {
  await session.close();
}
```

`createEinLlcN8nAdapter()` launches `node bin/ein-llc.mjs` from the
checkout root. No credentials are required for these four local tools.

An invalid date such as `2027-02-29` is refused by the existing
`get_state_fees` input schema (2027 is not a leap year). The adapter
surfaces that refusal from `callTool` as a thrown error or an MCP result
with `isError: true`.

## Tests

Adapter checks live at `checks/adapter.checks.mjs`, outside Node's default
`node --test` globs, so a root-only `npm ci` followed by the root `npm test`
(`node --test`) does not load them. The root package does not install this
adapter's MCP client dependency. Run the checks from this directory after
`npm install` here:

```sh
cd adapters/n8n
npm test
```

That script runs `node --test checks/adapter.checks.mjs` explicitly. The
checks make a real stdio call for the Delaware May 31 case and assert the
existing invalid-date refusal. They do not invent fees or require a network
account.

## Ownership

This directory owns only `adapters/n8n/**`. Root package manifests and
version fields stay unchanged while 0.3 is published.
