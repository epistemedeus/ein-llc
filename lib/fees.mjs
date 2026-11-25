import { z } from "zod";
import { isoDay, usJurisdiction } from "./rules.mjs";

const cents = z.number().int().nonnegative().max(100_000_000);
const reference = z.url({ protocol: /^https$/ });
const component = z.strictObject({ label: z.string().min(1).max(100), cents, source: reference });
const charge = z.strictObject({
  state: usJurisdiction,
  formation: component,
  firstYearOtherMandatory: z.array(component).max(12),
  conditions: z.string().min(1).max(500),
});
export const feeSnapshotSchema = z.strictObject({
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  asOf: isoDay,
  states: z.array(charge).min(1).max(51),
}).refine(({ states }) => new Set(states.map(row => row.state)).size === states.length, "Duplicate jurisdictions");

export const feeInput = z.strictObject({ state: usJurisdiction });

export function createFeeLookup(input) {
  const { asOf, sourceCommit, sourceSha256, states } = feeSnapshotSchema.parse(input);
  const rows = new Map(states.map(row => [row.state, row]));
  return ({ state }) => {
    const base = { state, currency: "USD", asOf, sourceCommit, sourceSha256 };
    const row = rows.get(state);
    if (!row) return { ...base, status: "unsupported_state" };
    const { formation, firstYearOtherMandatory, conditions } = row;
    return {
      ...base, status: "published_schedule", formation, firstYearOtherMandatory, conditions,
      firstYearStateTotalCents: firstYearOtherMandatory.reduce((sum, item) => sum + item.cents, formation.cents),
      window: "Ordinary state charges at formation and through the first anniversary, inclusive, for the stated conditions.",
      excludes: ["EIN.LLC service price", "registered agent", "expedited processing", "penalties", "other taxes"],
    };
  };
}
