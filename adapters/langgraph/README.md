# LangGraph adapter for ein-llc 0.3 public tools

This package is a thin LangGraph adapter around the four already-qualified
public local MCP tools in an [ein-llc](https://github.com/epistemedeus/ein-llc)
0.3 checkout:

- `get_state_fees`
- `draft_ss4`
- `get_compliance_deadlines`
- `verify_authority_letter`

It reuses the official [`MCPAdapter`](https://docs.langchain.com/oss/javascript/langchain/mcp)
stdio pattern from `@langchain/mcp-adapters` and binds the discovered tools into
a LangGraph [`ToolNode`](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents).
It does not reimplement fees, SS-4 drafts, deadlines, or authority verification,
and it does not change the root `package.json` or package version.

The local tools run over stdio with no network connection, account, or API key.

## Install from a checkout

Use Node.js 22.12 or later. From the repository root, install the existing
ein-llc dependencies, then this adapter's own dependencies:

```sh
npm ci --ignore-scripts
cd adapters/langgraph
npm install
```

Do not add LangGraph packages to the root manifest. The npm package `ein-llc`
is consumed from this git checkout (`node bin/ein-llc.mjs`), not from a
registry install.

## Run the no-credential example

```sh
cd adapters/langgraph
npm run example
```

The example starts the checkout stdio server, invokes `get_state_fees` through
the LangGraph ToolNode with `{"state":"DE","formationDate":"2027-05-31"}`, and
prints the dated first-year total. Delaware formation on May 31 has a $110
total through the first anniversary under the dated schedule
(`firstYearStateTotalCents` is `11000`).

## Use in code

```js
import {
  createEinLlcLangGraphAdapter,
  invokePublicTool,
  parseToolContent,
} from "./index.mjs";

const session = await createEinLlcLangGraphAdapter();
try {
  const message = await invokePublicTool(session, "get_state_fees", {
    state: "DE",
    formationDate: "2027-05-31",
  });
  console.log(parseToolContent(message));
  // session.graph is a compiled StateGraph whose `tools` node is a ToolNode
  // over the four public tools. You can also pass session.tools to your own
  // LangGraph workflow. Keep the session open while tools run, then close it.
} finally {
  await session.close();
}
```

`createEinLlcLangGraphAdapter()` launches `node bin/ein-llc.mjs` from the
checkout root. No credentials are required for these four local tools. An
optional LLM agent can use the same `session.tools` list; that step is outside
this example and would need its own model credentials.

An invalid date such as `2027-02-29` is refused by the existing
`get_state_fees` input schema (2027 is not a leap year). The adapter surfaces
that refusal as a ToolNode message with `status: "error"` and the schema
mismatch text `Received tool input did not match expected schema`.

## Tests

Adapter checks live at `checks/adapter.checks.mjs`, outside Node's default
`node --test` globs, so a root-only `npm ci` followed by the root `npm test`
(`node --test`) does not load them. The root package does not install this
adapter's LangChain dependencies. Run the checks from this directory after
`npm install` here:

```sh
cd adapters/langgraph
npm test
```

That script runs `node --test checks/adapter.checks.mjs` explicitly. The
checks make a real stdio call for the Delaware May 31 case and assert the
existing invalid-date refusal. They do not invent fees or require a network
account.

## Ownership

This directory owns only `adapters/langgraph/**`. Root package manifests and
version fields stay unchanged while 0.3 is published.
