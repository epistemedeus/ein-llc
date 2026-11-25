# EIN.LLC local tools and CLI

[![EIN LLC MCP server](https://glama.ai/mcp/servers/epistemedeus/ein-llc/badges/score.svg)](https://glama.ai/mcp/servers/epistemedeus/ein-llc)

Prepare paperwork, plan state filing costs, check filing dates and verify signed letters on your machine. Once dependencies are installed, the local MCP server runs over stdio with no network connection, account or API key.

| MCP tool | What you get |
| --- | --- |
| `get_state_fees` | Dated formation charges for all 50 states and DC. First-year totals cover the stated Delaware or Wyoming case. |
| `draft_ss4` | Line entries for a foreign-owned US disregarded single-member LLC that needs an EIN for Form 5472 and has no employment or withholding obligations. |
| `get_compliance_deadlines` | The ordinary calendar-year Form 5472 deadline with pro forma Form 1120, plus the first and next Wyoming annual report or Delaware LLC tax date. |
| `verify_authority_letter` | Offline ES256 verification against public keys you trust. Reports signed dates and scope. Current status, including revocation or replacement, requires the issuer. |

## Connect over stdio

After the release is on the default branch, use Node.js 22.12 or later and npm:

```sh
npx --yes github:epistemedeus/ein-llc
```

```json
{
  "mcpServers": {
    "ein-llc": {
      "command": "npx",
      "args": ["--yes", "github:epistemedeus/ein-llc"]
    }
  }
}
```

Append `#` and the full commit SHA to pin a specific source revision. From a clean source checkout, run `npm ci --ignore-scripts` followed by `node bin/ein-llc.mjs`. The local server reports **0.3.0**. CLI arguments, including `--version` and `--help`, run the bundled **CLI 0.2.2**. Some CLI commands use the EIN.LLC network service.

For the [typed local entry point](mod.ts), tested with Deno 2.9.6:

```sh
deno check --config jsr.json mod.ts
deno run --cached-only --deny-net --config jsr.json mod.ts
```

## Example tool arguments

**Delaware state fee planning.** Formation on May 31 has a $110 total through the first anniversary. Move the proposed date to June 1 and the $400 annual tax falls on the anniversary, for $510 total under the dated schedule.

```json
{"state":"DE","formationDate":"2027-05-31"}
```

For Wyoming, supply `wyomingAssetsCents` as the value of assets located and employed in Wyoming, including explicit zero when appropriate. The first report costs the greater of $60 and $0.0002 per qualifying dollar. A case requiring unverified rounding returns an unknown total. Tennessee requires `memberCount` from 1 to 20. Its paper formation fee is $50 per member, with a $300 minimum and a $3,000 statutory cap.

The [November 25, 2026 snapshot](lib/fee-snapshot.json) records each fee's official source and filing route. Complete totals cover an ordinary domestic LLC that stays active through the first anniversary. They exclude commercial registered agents, expedited service, EIN.LLC fees, penalties and separate costs triggered by business activity, nexus or local requirements. Other states return a formation charge and an unknown first-year total. A February 29 formation returns the formation charge and leaves the anniversary total open. Historical dates require the historical schedule.

**Form SS-4 draft.** Start with facts you know. The tool returns usable lines and the specific fields still needed for this draft. Enter taxpayer numbers directly on the form.

```json
{
  "entity":"foreign_owned_us_disregarded_single_member_llc",
  "purpose":"form_5472",
  "employmentAndWithholding":"none",
  "previouslyIssuedEin":false,
  "legalName":"Example Studio LLC"
}
```

**Filing dates.** Supply known related-party and Part V transaction facts for the calendar year being assessed.

```json
{
  "asOf":"2026-11-25",
  "entity":"active_domestic_llc",
  "formationState":"WY",
  "formationDate":"2025-09-30",
  "federal":{
    "foreignOwnedUsDisregardedEntity":"yes",
    "calendarYearUnderIrsRule":"yes",
    "reportingYear":2026,
    "relatedPartyTransactions":"no",
    "partVTransactions":"yes"
  }
}
```

**Authority letter.** Supply the compact signed copy as `jws`, the trusted issuer's public key set as `jwks`, and the date as `asOf`. Optionally set `action` to a signed action such as `quote`. An action listed in the letter conveys no access to accounts or funds.

The server does not store or log tool inputs. Your MCP client receives the output and may retain it. Keep taxpayer numbers and private keys out of your client. Review and sign any draft yourself, and check current official instructions and any special relief before filing. See [sources and limitations](PROVENANCE.md).

Run `npm test` for the local, stdio and CLI integrity checks. Run `deno publish --dry-run --config jsr.json` from a clean checkout to check the JSR source package.
