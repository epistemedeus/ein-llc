import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CompactSign, exportJWK, generateKeyPair } from "jose";
import { verifyAuthority, authorityInput } from "../lib/authority.mjs";
import { getDeadlines, deadlinesInput } from "../lib/deadlines.mjs";
import { createFeeLookup } from "../lib/fees.mjs";
import { draftSs4, ss4Input } from "../lib/ss4.mjs";
import metadata from "../package.json" with { type: "json" };
import bundled from "../cli-members.json" with { type: "json" };

const ss4 = {
  entity: "foreign_owned_us_disregarded_single_member_llc",
  purpose: "form_5472",
  employmentAndWithholding: "none",
  previouslyIssuedEin: false,
  legalName: "Example Draft LLC",
  mailingAddress: { street: "100 Sample Street", locality: "Example City, 10000, Canada" },
  physicalAddress: "same_as_mailing",
  principalLocation: "Example City, Ontario, Canada",
  responsibleParty: "Example Owner",
  tinStatus: "no_tin_and_ineligible",
  businessStart: "2026-11-01",
  closingMonth: 12,
  activity: "Other",
  otherActivity: "Software design",
  principalGoodsOrServices: "Design software interfaces",
};

const dates = {
  asOf: "2026-11-25", entity: "active_domestic_llc", formationState: "WY", formationDate: "2025-09-30",
  federal: {
    foreignOwnedUsDisregardedEntity: "yes", calendarYearUnderIrsRule: "yes", reportingYear: 2026,
    relatedPartyTransactions: "no", partVTransactions: "yes",
  },
};

async function signingKey(kid) {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const publicJwk = { ...await exportJWK(publicKey), kid, alg: "ES256", use: "sig", key_ops: ["verify"] };
  return { publicJwk, privateKey };
}

const manifest = {
  schema: "einllc.agent-authority.v1", id: "TESTABC2", check: "https://ein.llc/letter?n=TESTABC2",
  issuer: { legalName: "Example Issuer LLC", entityType: "LLC" },
  signedBy: { name: "Example Owner", title: "Member", at: "2026-11-23T00:00:00.000Z" },
  agent: { name: "Example Agent", reference: "example", role: "agent", isOwnerOrOfficer: false, maySign: false },
  may: ["quote"], limits: { currency: "USD", perTransaction: 100, perMonth: null },
  counterparties: "any", needsPerson: ["contract"],
  validFrom: "2026-11-23", validUntil: "2026-12-31", grantsAccessToMoneyOrAccounts: false,
};
async function sign(key, body = manifest) {
  return new CompactSign(new TextEncoder().encode(JSON.stringify(body)))
    .setProtectedHeader({ alg: "ES256", typ: "einllc.agent-authority.v1+jws", kid: key.publicJwk.kid })
    .sign(key.privateKey);
}
async function authorityFixture() {
  const key = await signingKey("test-key");
  return { jws: await sign(key), jwks: { keys: [key.publicJwk] }, asOf: "2026-11-25", action: "quote" };
}

test("SS-4 preserves supplied line facts, withholds taxpayer numbers, and reports missing qualifiers", () => {
  const result = draftSs4(ss4Input.parse(ss4));
  assert.equal(result.status, "draft_for_owner_review");
  assert.equal(result.lines["7b"], "foreign");
  assert.match(result.lines["9a"].detail, /5472$/);
  assert.deepEqual(result.lines["16"], { box: "Other", detail: "Software design" });
  assert.deepEqual(result.missing, []);
  assert.equal(draftSs4({ ...ss4, tinStatus: "has_ssn_or_itin" }).lines["7b"], "[Enter SSN or ITIN directly on the form]");
  assert.deepEqual(draftSs4({ ...ss4, tinStatus: "unknown", otherActivity: undefined }).missing, ["tinStatus", "otherActivity"]);
  assert.equal(draftSs4({ ...ss4, previouslyIssuedEin: true }).status, "unsupported");
  assert.equal(draftSs4({ ...ss4, entity: "other" }).status, "unsupported");
  assert.equal(draftSs4({ ...ss4, employmentAndWithholding: "some" }).status, "unsupported");
  assert.equal(draftSs4({ ...ss4, physicalAddress: { street: "P.O. BOX 10", locality: "Example" } }).status, "invalid_facts");
  assert.equal(ss4Input.safeParse({ ...ss4, businessStart: "2026-02-29" }).success, false);
  assert.equal(ss4Input.safeParse({ ...ss4, ssn: "synthetic" }).success, false);
});

test("dates use stated transaction facts, calendar rules and first/next actual state obligations", () => {
  const result = getDeadlines(deadlinesInput.parse(dates));
  assert.equal(result.federal.status, "required_for_stated_year");
  assert.equal(result.federal.due, "2027-04-15");
  assert.deepEqual(result.state.first, { scheduled: "2026-09-01", ordinaryTimelyThrough: "2026-09-01" });
  assert.deepEqual(getDeadlines({ ...dates, formationDate: "2024-09-30" }).state.first,
    { scheduled: "2025-09-01", ordinaryTimelyThrough: "2025-09-02" });
  assert.deepEqual(getDeadlines({ ...dates, formationDate: "2022-01-03" }).state.first,
    { scheduled: "2023-01-01", ordinaryTimelyThrough: "2023-01-03" });
  assert.deepEqual(getDeadlines({ ...dates, formationDate: "2024-10-31", formationState: "DE" }).state.first,
    { scheduled: "2025-06-01", ordinaryTimelyThrough: "2025-06-01" });
  assert.equal(getDeadlines({ ...dates, formationState: "TX" }).state.status, "unsupported_state");
  assert.equal(getDeadlines({ ...dates, entity: "other" }).status, "outside_entity_scope");
  assert.equal(getDeadlines({ ...dates, formationDate: "2030-01-01" }).status, "formation_after_as_of");
  assert.equal(deadlinesInput.safeParse({ ...dates, formationDate: "2026-04-31" }).success, false);
  assert.equal(deadlinesInput.safeParse({ ...dates, formationState: "ZZ" }).success, false);
  const federal = (year, overrides = {}) => getDeadlines({
    ...dates, asOf: `${year}-12-31`, formationDate: "2010-01-01", federal: { ...dates.federal, reportingYear: year, ...overrides },
  }).federal;
  assert.equal(federal(2021).due, "2022-04-18"); // Friday observed DC holiday.
  assert.equal(federal(2022).due, "2023-04-18"); // Saturday plus Monday observed DC holiday.
  assert.equal(federal(2027).due, "2028-04-18"); // Saturday plus Monday observed DC holiday.
  assert.equal(federal(2025, { partVTransactions: "unknown" }).status, "needs_transaction_facts");
  assert.equal(federal(2025, { partVTransactions: "no" }).status, "no_reportable_transactions_for_stated_year");
  assert.equal(federal(2025, { calendarYearUnderIrsRule: "no" }).status, "calendar_year_required");
});

test("fee lookup requires qualified-shaped rows and adds integer cents without invented defaults", () => {
  const source = "https://example.invalid/synthetic-fee";
  const fixture = {
    sourceCommit: "a".repeat(40), sourceSha256: "b".repeat(64), asOf: "2026-11-25",
    states: [{
      state: "AK", conditions: "Synthetic test fixture. No actual price.",
      formation: { label: "fixture initial", cents: 12, source },
      firstYearOtherMandatory: [{ label: "fixture recurring", cents: 34, source }],
    }],
  };
  const lookup = createFeeLookup(fixture);
  assert.equal(lookup({ state: "AK" }).firstYearStateTotalCents, 46);
  assert.equal(lookup({ state: "DE" }).status, "unsupported_state");
  assert.equal("firstYearStateTotalCents" in lookup({ state: "DE" }), false);
  assert.throws(() => createFeeLookup(null));
  assert.throws(() => createFeeLookup({ ...fixture, states: [...fixture.states, ...fixture.states] }));
  assert.throws(() => createFeeLookup({ ...fixture, states: [{ ...fixture.states[0], formation: { label: "missing" } }] }));
});

test("letter uses signature, schema, signed dates and scope, with live authority unknown", async () => {
  const oldKey = await signingKey("old");
  const newKey = await signingKey("new");
  const wrongKey = await signingKey("new");
  const good = { jws: await sign(newKey), jwks: { keys: [oldKey.publicJwk, newKey.publicJwk] }, asOf: "2026-11-25", action: "quote" };
  const result = await verifyAuthority(authorityInput.parse(good));
  assert.equal(result.signature, "valid");
  assert.equal(result.schema, "valid");
  assert.equal(result.actionListed, true);
  assert.equal(result.signedWindow, "within_window");
  assert.equal(result.usable, false);
  assert.equal(result.currentStatus, "unknown");
  assert.equal("manifest" in result, false);
  assert.equal((await verifyAuthority({ ...good, action: "refund" })).actionListed, false);
  assert.equal((await verifyAuthority({ ...good, asOf: "2027-01-01" })).signedWindow, "expired");
  assert.equal((await verifyAuthority({ ...good, asOf: "2026-11-22" })).signedWindow, "pending");
  assert.equal((await verifyAuthority({ ...good, jwks: { keys: [oldKey.publicJwk] } })).reason, "unknown_kid");
  assert.equal((await verifyAuthority({ ...good, jwks: { keys: [wrongKey.publicJwk] } })).reason, "signature_invalid");
  assert.equal((await verifyAuthority({ ...good, jws: await sign(oldKey) })).signature, "valid");
  assert.equal((await verifyAuthority({ ...good, jws: "invalid" })).reason, "invalid_profile");
  const [header, body, signature] = good.jws.split(".");
  assert.equal((await verifyAuthority({ ...good, jws: [header, body, (signature[0] === "A" ? "B" : "A") + signature.slice(1)].join(".") })).reason, "signature_invalid");
  assert.equal((await verifyAuthority({ ...good, jws: await sign(newKey, { ...manifest, may: ["sign"] }) })).reason, "invalid_manifest");
  assert.equal(authorityInput.safeParse({ ...good, jwks: { keys: [{ ...newKey.publicJwk, d: "synthetic" }] } }).success, false);
  // A later revoked/replaced status is independent of a valid, previously issued token.
  for (const status of ["revoked", "replaced"]) {
    assert.equal(authorityInput.safeParse({ ...good, currentStatus: status }).success, false);
    assert.equal((await verifyAuthority(good)).currentStatus, "unknown");
  }
});

test("preserved CLI manifest verifies every bundled member", () => {
  const names = readdirSync("cli", { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name).slice(4)).sort();
  assert.equal(names.length, 45);
  assert.deepEqual(names, Object.keys(bundled.members).filter(name => !Object.hasOwn(bundled.excludedDocumentation, name)).sort());
  for (const name of names) assert.equal(createHash("sha256").update(readFileSync(join("cli", name))).digest("hex"), bundled.members[name], name);
});

test("installed stdio receives initialize, all local tools, failure recovery and child close", async () => {
  const command = process.env.EIN_TEST_COMMAND ?? process.execPath;
  const args = process.env.EIN_TEST_ARGS ? JSON.parse(process.env.EIN_TEST_ARGS) : ["bin/ein-llc.mjs"];
  const env = process.env.EIN_TEST_ENV ? JSON.parse(process.env.EIN_TEST_ENV) : {};
  const transport = new StdioClientTransport({ command, args, env, cwd: process.env.EIN_TEST_CWD, stderr: "pipe" });
  let stderr = "";
  transport.stderr?.on("data", chunk => { stderr += chunk; });
  const client = new Client({ name: "ein-offline-proof", version: "1.0.0" });
  try {
    await client.connect(transport, { timeout: 60_000 });
    assert.deepEqual(client.getServerVersion(), { name: "ein-llc-local", version: metadata.version });
    const list = await client.listTools();
    assert.deepEqual(list.tools.map(t => t.name).sort(), ["draft_ss4", "get_compliance_deadlines", "verify_authority_letter"]);
    assert.ok(list.tools.every(t => t.annotations.readOnlyHint && !t.annotations.openWorldHint));
    const call = (name, args) => client.callTool({ name, arguments: args });
    const first = await call("draft_ss4", ss4);
    assert.equal(first.structuredContent.lines["1"], ss4.legalName);
    assert.equal((await call("draft_ss4", { ...ss4, businessStart: "2026-13-01" })).isError, true);
    assert.deepEqual((await call("draft_ss4", ss4)).structuredContent, first.structuredContent);
    assert.equal((await call("get_compliance_deadlines", dates)).structuredContent.federal.due, "2027-04-15");
    const fixture = await authorityFixture();
    const proof = (await call("verify_authority_letter", fixture)).structuredContent;
    assert.equal(proof.signature, "valid");
    assert.equal(proof.schema, "valid");
    assert.equal(proof.currentStatus, "unknown");
    assert.equal((await call("verify_authority_letter", { ...fixture, jws: "invalid" })).structuredContent.signature, "invalid");
    assert.equal(stderr.includes(ss4.responsibleParty), false);
    assert.equal(stderr.includes(fixture.jws), false);
    assert.equal(stderr.includes("PermissionDenied"), false);
  } finally {
    await client.close();
  }
  assert.equal(transport.pid, null);
});
