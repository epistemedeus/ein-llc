# EIN.LLC local tools and CLI

The local MCP server prepares paperwork and checks dates and signatures on your machine. It runs over standard input and output. Once dependencies are installed, it needs no connection, account or API key.

This branch is a release candidate. The public default remains at the [previous release](https://github.com/epistemedeus/ein-llc/tree/29dd24822c7213ee969f5628578d8b740fb58810) until the fee review and merge.

| MCP tool | What you get |
| --- | --- |
| `draft_ss4` | Line entries for a foreign-owned US disregarded single-member LLC that needs an EIN for Form 5472 and has no employment or withholding obligations. The owner supplies any SSN or ITIN directly on the form and reviews, signs and submits it. |
| `get_compliance_deadlines` | The ordinary Form 5472 deadline with pro forma Form 1120 for the calendar reporting year you provide, plus the first and next Wyoming annual report or Delaware LLC tax date. The federal schedule handles weekends and DC Emancipation Day. Supply known reportable transaction facts for the stated year, including Part V. |
| `verify_authority_letter` | Verification of a compact ES256 letter with a public JWKS you trust. It reports the signed dates and scope. Live status, including revocation or replacement, remains unknown offline. |

The first-year state fees tool is withheld pending an approved public fee snapshot. Its total will cover ordinary mandatory state fees at formation and through the first anniversary, inclusive, for the stated conditions and jurisdiction.

The server does not store inputs or log them. The MCP client receives the draft and may retain the conversation. Keep taxpayer numbers and private keys out of the client. Verify filing dates against current official instructions and any special relief. The [sources and limitations](PROVENANCE.md) describe the rules used.

## Run this checkout

Node.js 22.12 or later

```sh
npm ci --ignore-scripts
node bin/ein-llc.mjs
```

Configure your MCP client to run the same command from this checkout and connect over stdio. On Deno, cache the declared dependencies before running with network access denied.

```sh
deno check --config jsr.json mod.ts
deno run --cached-only --deny-net --config jsr.json mod.ts
```

The local package version is **0.3.0-alpha.1**. Passing arguments runs the preserved EIN.LLC CLI **0.2.2**. Its commands may contact EIN.LLC. Inspect its help before choosing a command.

```sh
node bin/ein-llc.mjs --version
node bin/ein-llc.mjs --help
```

The intended GitHub install is `npx github:epistemedeus/ein-llc`. Until the release is merged, append the candidate commit after `#` to install this version instead of the current default. JSR preparation covers the local server module and its typed factory. The scope is pending publisher confirmation.

Run `npm test` for the local, stdio and CLI integrity checks. Run `deno publish --dry-run --config jsr.json` from a clean checkout to verify the JSR package.
