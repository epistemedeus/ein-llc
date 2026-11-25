# Provenance: ein-formation-http-client v0.1.1

SPDX-License-Identifier: MIT

This archive is a release candidate for Root. It is an allowlisted extract of the
standalone public EIN formation HTTP client, reconciled to the assessment-bound
server and owner activation head `7f5165b5f8e6ec3b5c8c86d1e48b16dfb12ca0e9`.
That pin is the contract this candidate implements. It is not a claim that an
external review signed these bytes, and it is not a claim that the pin commit
contains this client tree. Exact file identity is the manifest `sourceFiles` list.

| Field | Value |
| --- | --- |
| Artifact | `ein-formation-http-client-v0.1.1.tgz` / `ein-formation-http-client-v0.1.1.zip` |
| Public URL (tgz) | `https://ein.llc/downloads/ein-formation-http-client-v0.1.1.tgz` |
| Public URL (zip) | `https://ein.llc/downloads/ein-formation-http-client-v0.1.1.zip` |
| Package version | `0.1.1` |
| Server and owner contract pin | `7f5165b5f8e6ec3b5c8c86d1e48b16dfb12ca0e9` |
| Previous published client cohort | `f31eba83ebb2531788a3c1fb993b5b72c8075040` (v0.1.0, immutable) |
| Candidate status | release candidate; not yet the published download |
| SPDX license | MIT |
| npm publish | Not published to the npm registry |

v0.1.0 stays the previously published immutable archive and does not forward
assessmentId. This candidate's assess result exposes assessmentId. Its prepare
forwards assessmentId and an optional operationId. A replay of the same
assessment, intended email, and stored preparation recovers that application.
Human claim, intake, and payment stay human.

The public manifest `sourceTipSha` is the contract pin above. `sourceTreeSha256`
hashes the compact JSON sourceFiles array in allowlist order. Those hashes are
content identity, not a signature or evidence of hosted availability.

Boundaries: zero npm runtime dependencies; agents never claim, pay, or invent grants.
Tests, private fixtures, partner-first-case materials, and activation-client packages
are intentionally excluded from this allowlist.

The response-binding correction is independently received at source
`e99a735fdae9ed5e4329fbb3b3e61022985d4a0e` on an actual remote checkout.
Prepare validates the requested bound/unbound state and exact assessmentId when
supplied; inconsistent mutation responses remain unknown and are not replayed.
The runtime pin identifies those reviewed client bytes; deployment remains a
separate receiving step.
