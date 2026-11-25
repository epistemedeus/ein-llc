import { z } from "zod";
import { isoDay } from "./rules.mjs";
import { createVerifier } from "./vendor/agent-authority-letter/verify.mjs";

const actions = z.enum(["quote", "order", "sell", "pay", "refund", "terms", "correspond", "documents"]);
const key = z.strictObject({
  kty: z.literal("EC"), crv: z.literal("P-256"), alg: z.literal("ES256"),
  use: z.literal("sig"), key_ops: z.tuple([z.literal("verify")]),
  kid: z.string().min(1).max(128), x: z.string().length(43), y: z.string().length(43),
});
export const authorityInput = z.strictObject({
  jws: z.string().min(1).max(24576),
  jwks: z.strictObject({ keys: z.array(key).min(1).max(32) }).describe("Public key set obtained from a trusted issuer source. Never include private key material."),
  asOf: isoDay,
  action: actions.optional().describe("Check whether this action is listed in the signed scope. This does not grant access or establish permission."),
});

export async function verifyAuthority(input) {
  const context = {
    asOf: input.asOf, mode: "offline", currentStatus: "unknown", usable: false,
    verifierSource: "https://github.com/epistemedeus/agent-authority-letter/tree/d5b34ab0452d2031b55bb2e8c543d62e2f5dba53",
  };
  let verifier;
  try { verifier = createVerifier({ offline: true, jwks: input.jwks }); }
  catch { return { ...context, signature: "unknown", schema: "unknown", reason: "invalid_jwks" }; }
  const { signature, schema, reason, manifest } = await verifier(input.jws);
  const result = { ...context, signature, schema, reason };
  if (!manifest) return result;
  const { validFrom, validUntil, may, limits, needsPerson, counterparties } = manifest;
  return {
    ...result, validFrom, validUntil,
    signedWindow: input.asOf < validFrom ? "pending" : input.asOf > validUntil ? "expired" : "within_window",
    signedScope: {
      actions: may, limits, needsPerson, counterpartyRestriction: counterparties === "any" ? "any" : "restricted",
      grantsAccessToMoneyOrAccounts: false,
    },
    ...(input.action === undefined ? {} : { action: input.action, actionListed: may.includes(input.action) }),
  };
}
