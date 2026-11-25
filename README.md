# EIN.LLC

Use the EIN.LLC MCP tools from a stdio client, or run the EIN.LLC CLI with arguments. Requires Node.js 22.12 or later, npm and Git.

## Connect an MCP client

Use this command and argument in your client's stdio server configuration:

```json
{"command":"npx","args":["github:epistemedeus/ein-llc"]}
```

The connection uses the [EIN.LLC MCP endpoint](https://ein.llc/mcp). No account is needed for public reads such as state fee comparisons. Application status requires a grant. The person reviews the application and approves payment.

## Use the CLI

```sh
npx github:epistemedeus/ein-llc --help
npx github:epistemedeus/ein-llc capabilities
```

See [provenance and transport behavior](PROVENANCE.md). [License](LICENSE) · [EIN.LLC](https://ein.llc)
