# Provenance: ein-activation-continuation v0.1.6

SPDX-License-Identifier: MIT

Source received before editing: `afdcd97814f69c078acb3cdfd4b88be5a2cbea01`,
the integration of PR207's task-return contract. This amends hosted v0.1.5
from `e555613e5f554181920a1262117ddcb580e684af` (PR183).
The executable lineage remains PR171's continuation and PR173's portable
HTTP/MCP/A2A adapters and lost-reply recovery. This adds no formation engine.

Vendored dependency: MIT `ein-formation-http-client` v0.1.1, reviewed runtime
`7f5165b5f8e6ec3b5c8c86d1e48b16dfb12ca0e9`. Only the existing pack allowlist is
copied; no npm publication or private checkout is needed by a consumer.

Preserved baseline files (archives immutable; the live index remains Root-owned):

| File | SHA-256 |
| --- | --- |
| `ein-activation-continuation-v0.1.0.tgz` | `f8e5addb6bd4c0f1320f2b0489dbd283ab0bd3f0b995686903e51d27607e9e27` |
| `ein-activation-continuation-v0.1.1.tgz` | `7e72637dda9590d8f8575281d794e746b55654b0992a733b47c822daa541f087` |
| `ein-activation-continuation-v0.1.2.tgz` | `802974d20b45d57203ce40ca995362c80bff1463b567ea034c3f42e00ff8a313` |
| `ein-activation-continuation-v0.1.3.tgz` | `1273c33e77aadef2eececd1d1c7269ef9c9205558c223adb2982e7517d523ad2` |
| `ein-activation-continuation-v0.1.4.tgz` | `03d11fa08fd88af8a71111a16c20e54dfa68a8f70ab5c5c16228d4eaa51ce576` |
| `ein-activation-continuation-v0.1.5.tgz` | `e490d78753e8bb8e18aa517b882107f667f088546ace4888e5f86b86b9afb6f0` |

The versioned successor has 39 allowlisted members and per-file SHA-256 in
`ein-activation-continuation-v0.1.6.json`. Re-emission accepts identical bytes.
A frozen archive is never rewritten. The release workflow refreshes this
unfrozen candidate from the allowlisted public client until the candidate is
frozen. Tests, state, credentials, traces and receiving records are excluded.
License is `LICENSE` (MIT).

v0.1.3 suppresses the catalog offer in terminal or uncertain assessment output
and shares the response byte allowance across all command reads. v0.1.4 does
not label `async_pending` as paid, and readback ignores a stale paid or complete
boolean unless the application state is paid and fulfillment is complete.
v0.1.5 vendors the current public client allowlist. Continuation commands,
grants, and payment boundaries are unchanged.
The original Sol340 server and continuation remain the
owners of assessment and application authority. Root's mutable machine index
and deployment receipt carry current release facts outside the frozen archive.

`published: false`, `humanPagesChanged: false`, and
`libraryDownloadIsCustomerActivation: false` remain explicit. Root reviews
integration and updates its live machine index when publishing. A cold QA run
is not customer activation, payment, filing or legal authority.
