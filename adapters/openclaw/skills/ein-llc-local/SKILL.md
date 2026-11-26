---
name: ein-llc-local
description: Use the local ein-llc 0.3 MCP tools for state LLC fees, SS-4 drafts, filing dates, and authority letters. No account or API key.
---

# ein-llc local tools

This skill is invocable as `/ein-llc-local`. It does not start the MCP
server. Configure OpenClaw `mcp.servers.ein-llc` first with a stdio
command of `node`, `args` pointing at this ein-llc checkout's
`bin/ein-llc.mjs`, and `cwd` set to the absolute checkout root. The
adapter file `openclaw.config.json` is a checkout-local example; rewrite
relative `cwd` (`../..`) before copying it into OpenClaw's own config.
After root dependencies are installed, OpenClaw launches
`node bin/ein-llc.mjs` with no network, account, or API key.

Use only these four public tools:

- `get_state_fees` for dated formation charges. For a Delaware formation on
  2027-05-31, pass `{"state":"DE","formationDate":"2027-05-31"}`. The dated
  first-year total is $110 (`firstYearStateTotalCents` is 11000). Do not invent
  other prices.
- `draft_ss4` for Form SS-4 line entries for a foreign-owned US disregarded
  single-member LLC. Leave taxpayer numbers and signatures for the owner.
- `get_compliance_deadlines` for ordinary calendar-year Form 5472 dates and
  the Delaware or Wyoming LLC schedule.
- `verify_authority_letter` for offline ES256 verification against trusted
  public keys. Live status, including revocation, remains unknown.

An invalid date such as `2027-02-29` is refused by the existing
`get_state_fees` input schema (2027 is not a leap year). Report that refusal.
Do not invent a fee. Review official instructions before filing.
