# Vercel AI SDK adapter for ein-llc 0.3 public tools

This package is a thin [Vercel AI SDK](https://ai-sdk.dev) adapter around the
four already-qualified public local MCP tools in an
[ein-llc](https://github.com/epistemedeus/ein-llc) 0.3 checkout:

- `get_state_fees`
- `draft_ss4`
- `get_compliance_deadlines`
- `verify_authority_letter`

It reuses the official [`createMCPClient`](https://ai-sdk.dev/docs/reference/ai-sdk-core/create-mcp-client)
and [`StdioMCPTransport`](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools) from
[`@ai-sdk/mcp`](https://www.npmjs.com/package/@ai-sdk/mcp), following the
maintained [MCP tools cookbook](https://ai-sdk.dev/v6/cookbook/node/mcp-tools)
and the [AI SDK with MCP](https://vercel.com/docs/mcp/integrations/ai-sdk)
stdio pattern. It does not reimplement fees, SS-4 drafts, deadlines, or
authority verification, and it does not change the root `package.json` or
package version.

The local tools run over stdio with no network connection, account, or API key.

## Install from a checkout

Use Node.js 22.12 or later. From the repository root, install the existing
ein-llc dependencies, then this adapter's own dependencies:

```sh
npm ci --ignore-scripts
cd adapters/vercel-ai
npm install
```

Do not add Vercel AI SDK packages to the root manifest. The npm package
`ein-llc` is consumed from this git checkout (`node bin/ein-llc.mjs`), not
from a registry install.

## Run the no-credential example

```sh
cd adapters/vercel-ai
npm run example
```

The example starts the checkout stdio server, invokes `get_state_fees` through
the official AI SDK MCP client with `{"state":"DE","formationDate":"2027-05-31"}`,
and prints the dated first-year total. Delaware formation on May 31 has a $110
total through the first anniversary under the dated schedule
(`firstYearStateTotalCents` is `11000`).

## Use in code

```js
import {
  createEinLlcVercelAiAdapter,
  invokePublicTool,
  parseToolContent,
} from "./index.mjs";

const session = await createEinLlcVercelAiAdapter();
try {
  const result = parseToolContent(
    await invokePublicTool(session, "get_state_fees", {
      state: "DE",
      formationDate: "2027-05-31",
    }),
  );
  console.log(result);
  // session.tools is the four public tools in AI SDK tool shape. Pass that
  // object to generateText({ model, tools: session.tools, ... }) in your own
  // app if you have model credentials. Keep the session open while tools run,
  // then close it.
} finally {
  await session.close();
}
```

`createEinLlcVercelAiAdapter()` launches `node bin/ein-llc.mjs` from the
checkout root. No credentials are required for these four local tools. An
optional `generateText` call can use the same `session.tools` object; that
step is outside this example and would need its own model credentials.

An invalid date such as `2027-02-29` is refused by the existing
`get_state_fees` input schema (2027 is not a leap year). The adapter surfaces
that refusal from the tool `execute` path as a thrown error or an error
result whose text describes the schema mismatch.

## Tests

Adapter checks live at `checks/adapter.checks.mjs`, outside Node's default
`node --test` globs, so a root-only `npm ci` followed by the root `npm test`
(`node --test`) does not load them. The root package does not install this
adapter's Vercel AI SDK dependencies. Run the checks from this directory
after `npm install` here:

```sh
cd adapters/vercel-ai
npm test
```

That script runs `node --test checks/adapter.checks.mjs` explicitly. The
checks make a real stdio call for the Delaware May 31 case and assert the
existing invalid-date refusal. They do not invent fees or require a network
account.

## Ownership

This directory owns only `adapters/vercel-ai/**`. Root package manifests and
version fields stay unchanged while 0.3 is published.
