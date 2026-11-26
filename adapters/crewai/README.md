# CrewAI adapter for ein-llc 0.3 public tools

This package is a thin CrewAI adapter around the four already-qualified
public local MCP tools in an [ein-llc](https://github.com/epistemedeus/ein-llc)
0.3 checkout:

- `get_state_fees`
- `draft_ss4`
- `get_compliance_deadlines`
- `verify_authority_letter`

It reuses the official CrewAI MCP stdio pattern
([`MCPServerAdapter` / `StdioServerParameters`](https://docs.crewai.com/edge/en/mcp/stdio))
from `crewai-tools`, `mcp`, and `mcpadapt`. Official `MCPServerAdapter` 1.15.45
currently cannot build a Pydantic model for `verify_authority_letter` because
CrewAI's schema converter does not accept draft-07 tuple `items` arrays on
JWKS `key_ops`. This adapter starts the same stdio server, normalizes that
schema shape, and wraps the four public tools as CrewAI `BaseTool` objects.
It does not reimplement fees, SS-4 drafts, deadlines, or authority
verification, and it does not change the root `package.json` or package version.

The local tools run over stdio with no network connection, account, or API key.

## Install from a checkout

Use Node.js 22.12 or later and Python 3.11 or later. From the repository root,
install the existing ein-llc dependencies, then this adapter's own Python
dependencies in a local virtualenv:

```sh
npm ci --ignore-scripts
cd adapters/crewai
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

You can also install with `uv pip install -r requirements.txt` into the same
virtualenv. Do not add CrewAI packages to the root Node manifest. The npm
package `ein-llc` is consumed from this git checkout (`node bin/ein-llc.mjs`),
not from a registry install.

## Run the no-credential example

```sh
cd adapters/crewai
.venv/bin/python example.py
```

The example starts the checkout stdio server, invokes `get_state_fees` through
the CrewAI MCP tool wrapper with `{"state":"DE","formationDate":"2027-05-31"}`,
and prints the dated first-year total. Delaware formation on May 31 has a $110
total through the first anniversary under the dated schedule
(`firstYearStateTotalCents` is `11000`).

## Use in code

```python
from adapter import create_ein_llc_crewai_adapter, invoke_public_tool, parse_tool_result

with create_ein_llc_crewai_adapter() as tools:
    raw = invoke_public_tool(
        tools,
        "get_state_fees",
        state="DE",
        formationDate="2027-05-31",
    )
    print(parse_tool_result(raw))
    # `tools` is a list of CrewAI BaseTool objects for the four public tools.
    # You can also pass that list to a CrewAI Agent. An optional LLM agent
    # step is outside this example and would need its own model credentials.
```

`create_ein_llc_crewai_adapter()` launches `node bin/ein-llc.mjs` from the
checkout root. No credentials are required for these four local tools.

An invalid date such as `2027-02-29` is refused by the existing
`get_state_fees` input schema (2027 is not a leap year). The adapter surfaces
that refusal from the existing tool schema; it does not invent a fee.

## Checks

Adapter checks live at `checks/adapter.checks.py`, outside Node's default
`node --test` globs, so a root-only `npm ci` followed by the root `npm test`
(`node --test`) does not load them. The root package does not install this
adapter's Python dependencies. Run the checks from this directory after
installing into `.venv`:

```sh
cd adapters/crewai
.venv/bin/python checks/adapter.checks.py
```

The checks make a real stdio call for the Delaware May 31 case and assert the
existing invalid-date refusal. They do not invent fees or require a network
account.

## Ownership

This directory owns only `adapters/crewai/**`. Root package manifests and
version fields stay unchanged while 0.3 is published.
