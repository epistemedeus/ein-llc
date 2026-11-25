# Provenance

The bundled CLI is version 0.2.2, from source commit `2322e6b8afa2916bb326f5454fbf78126d6c3a99`, tree `591908fb1e2824c9a7019f696386b2fd21d45973`. Its qualified archive SHA-256 is `d56cfbfd25578b463bd63b03c6391aebe454b393cc39ff00d1c4bd5970c3682b`. The [member manifest](cli-members.json) pins the 45 bundled files and two omitted upstream documentation files. The launcher still passes all CLI arguments through, with standalone `--version` as an alias for `version`.

The local server uses the [official TypeScript MCP SDK 1.32.2](https://github.com/modelcontextprotocol/typescript-sdk/tree/3b73021a0a2272c0c04c3917bcdb03398b3ec63f) (MIT), its stdio transport and Zod 4.6.7 (MIT). The former remote adapter remains in [the previous source](https://github.com/epistemedeus/ein-llc/tree/29dd24822c7213ee969f5628578d8b740fb58810). npm and Deno dependency locks retain their exact closures and integrity pins.

## Letter verifier

The MIT-licensed verifier, profile and schema in `lib/vendor/agent-authority-letter` are exact public blobs from [d5b34ab0452d2031b55bb2e8c543d62e2f5dba53](https://github.com/epistemedeus/agent-authority-letter/tree/d5b34ab0452d2031b55bb2e8c543d62e2f5dba53). Included source and exact Git blob IDs follow.

| Upstream member | Git blob |
| --- | --- |
| `LICENSE` | `06863e340dddca820ab2364cba7d5c809fde34dc` |
| `src/verify.mjs` | `03e91c4dc36aa6dc39460f133f6094475eb6b6e5` |
| `src/authority-letter-profile.mjs` | `503352dde345a0610f31e2f7f832b68520724301` |
| `src/einllc.agent-authority.v1.schema.json` | `cffc2dcd07e060c6dac29682ac2b2daa4a626378` |

The wrapper uses the upstream offline option with the exact dependency pins `ajv@8.20.0` and `jose@6.2.18`, both MIT. It reports token integrity and omits names and identifiers from results. An indicated action comes from the signed letter. It conveys no access to money or accounts and establishes neither the authenticity of caller-supplied keys nor the current authority of the agent. Key rotation is limited to the trusted public keys you supply. Revocation and replacement require a current issuer status check.

## Filing rules

Sources reviewed November 25, 2026.

- The SS-4 draft uses the December 2025 form and instructions, including lines 7b, 9a and 10 for the limited foreign-owned disregarded entity case. [Form SS-4](https://www.irs.gov/pub/irs-pdf/fss4.pdf), [IRS instructions](https://www.irs.gov/instructions/iss4).
- The Form 5472 calculation uses the IRS treatment of a foreign-owned US disregarded entity, reportable transactions and the calendar-year pro forma Form 1120 filing schedule. Its shift covers the ordinary April weekend and DC Emancipation Day cases. It does not calculate a fiscal year, a filed extension or special relief. [Form 5472 instructions](https://www.irs.gov/instructions/i5472), [Form 1120 instructions](https://www.irs.gov/instructions/i1120), [IRS Notice 2011-17](https://www.irs.gov/pub/irs-drop/n-11-17.pdf).
- Wyoming annual reports start the year after formation and are scheduled for the first of the anniversary month. The timeliness calculation applies the ordinary next-business-day rule and relevant listed state holidays. [First annual report](https://sos.wyo.gov/Forms/WyoBiz/What%27s_Next.pdf), [W.S. 16-4-303 and 304](https://wyoleg.gov/statutes/compress/title16.pdf), [State holidays](https://sos.wyo.gov/Holiday.aspx).
- Delaware’s domestic LLC annual tax has a statutory June 1 date following the calendar year, including the year of formation. The tool returns that statutory date and assumes no special extension, cancellation or alternate treatment. [6 Del. C. § 18-1107](https://delcode.delaware.gov/title6/c018/sc11/index.html).

## State fees

[The public snapshot](lib/fee-snapshot.json) records the sources reviewed November 25, 2026, and the ordinary formation method and charge for each of the 50 states and DC. Tennessee uses its sourced per-member formula. The three audited annual report entries are Wyoming's asset-based charge and Florida's on-time and late charges. The Delaware annual tax comes from the separately cited Delaware statute. Florida's entries cover only that charge and do not establish a first-year total.

The first-year estimate counts mandatory state charges scheduled from formation through the first anniversary, inclusive, for the stated ordinary domestic LLC case. A Delaware LLC pays its first annual tax on June 1 after the formation year. A Wyoming LLC's first annual report is scheduled for the first day of its anniversary month the following year. The Wyoming estimate uses the mail route and the greater of the minimum or the exact asset-based fee, with a separate unknown result when rounding would be needed. See the [Delaware statute](https://delcode.delaware.gov/title6/c018/sc11/index.html) and [Wyoming fee guidance](https://sos.wyo.gov/FAQS.aspx?root=BUS).

New Mexico's [official filing portal](https://enterprise.sos.nm.gov/forms/business/) and [statute index](https://www.sos.nm.gov/business-services/statutes-governing-business-in-nm/) did not establish complete first-year coverage. Its formation entry cites the official legislative revenue index and the filing portal. The other formation figures also do not establish complete first-year obligations outside Delaware and Wyoming. Future budgets assume the dated rates and rules stay in effect.
