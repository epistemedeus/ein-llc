import { z } from "zod";
import { firstStateDueDate } from "./deadlines.mjs";
import { isoDay, usJurisdiction } from "./rules.mjs";

const cents = z.number().int().nonnegative();
const references = z.array(z.url({ protocol: /^https$/ })).min(1);
const method = z.enum(["mail", "online", "document_upload"]);
const flatCharge = { cents, method, sources: references };
const formationRow = z.strictObject({
  state: usJurisdiction,
  name: z.string().min(1),
  method,
  sources: references,
  conditions: z.string().optional(),
  coverageGaps: z.array(z.string()).optional(),
  cents: cents.optional(),
  components: z.array(z.strictObject({ name: z.string(), cents })).optional(),
  perMember: z.strictObject({
    rateCents: cents.positive(), minimumCents: cents, maximumCents: cents, supportedMaxMembers: z.int().positive(),
  }).optional(),
}).refine(row =>
  row.perMember ? row.cents === undefined && row.components === undefined :
    row.cents !== undefined && (!row.components || row.components.reduce((sum, item) => sum + item.cents, 0) === row.cents),
"Formation row must have one rate shape with matching components");

export const feeSnapshotSchema = z.strictObject({
  asOf: isoDay,
  formation: z.array(formationRow).length(51),
  annual: z.strictObject({
    DE: z.strictObject({ name: z.string(), ...flatCharge }),
    WY: z.strictObject({
      name: z.string(), minimumCents: cents, assetCentsPerFeeCent: z.int().positive(), method, sources: references,
    }),
    FL: z.tuple([
      z.strictObject({ period: z.literal("on-time"), ...flatCharge }),
      z.strictObject({ period: z.literal("late"), ...flatCharge }),
    ]),
  }),
}).refine(({ formation }) => new Set(formation.map(row => row.state)).size === 51, "Expected every jurisdiction exactly once");

export const feeInput = z.strictObject({
  state: usJurisdiction,
  formationDate: isoDay.describe("Planned date of formation in YYYY-MM-DD. Rates are from the published snapshot."),
  memberCount: z.int().positive().optional().describe("Required for a Tennessee amount. Supported counts are 1 through 20."),
  wyomingAssetsCents: cents.optional().describe("Amount in USD cents of assets located and employed in Wyoming for the first annual report. Supply zero explicitly if appropriate."),
});

const uncovered = ["Verified mandatory initial filings, recurring state reports or taxes, and their due dates through the first anniversary"];

function formationCharge({ cents, perMember, method, sources, components, conditions }, memberCount) {
  const route = { method, sources, ...(conditions ? { conditions } : {}) };
  if (!perMember) return { ...route, cents, ...(components ? { components } : {}) };
  if (memberCount === undefined || memberCount > perMember.supportedMaxMembers) {
    return { ...route, cents: null, formula: perMember, reason: memberCount === undefined ? "member_count_required" : "unsupported_member_count" };
  }
  const { minimumCents, maximumCents, rateCents } = perMember;
  return {
    ...route,
    cents: Math.min(maximumCents, Math.max(minimumCents, rateCents * memberCount)),
    memberCount,
    formula: perMember,
  };
}

function annualCharge(state, formationDate, through, row, assets) {
  const dueDate = firstStateDueDate(state, formationDate);
  const { name, method, sources } = row;
  const base = { name, dueDate, method, sources };
  if (dueDate > through) return { ...base, stateChargeCents: row.cents, inWindowCents: 0, status: "due_after_window" };
  if (state === "DE") return { ...base, stateChargeCents: row.cents, inWindowCents: row.cents, status: "due_in_window" };
  const { minimumCents, assetCentsPerFeeCent } = row;
  const formula = { minimumCents, assetCentsPerFeeCent };
  if (assets === undefined) {
    return { ...base, formula, inWindowCents: null, status: "qualifying_wyoming_assets_required" };
  }
  if (assets > minimumCents * assetCentsPerFeeCent && assets % assetCentsPerFeeCent !== 0) {
    return { ...base, formula, inWindowCents: null, status: "official_rounding_required" };
  }
  const amount = Math.max(minimumCents, assets / assetCentsPerFeeCent);
  return { ...base, formula, stateChargeCents: amount, inWindowCents: amount, status: "due_in_window" };
}

export function createFeeLookup(input) {
  const { asOf, formation, annual } = feeSnapshotSchema.parse(input);
  const rows = new Map(formation.map(row => [row.state, row]));
  return ({ state, formationDate, memberCount, wyomingAssetsCents }) => {
    const row = rows.get(state);
    const base = {
      state, name: row.name, currency: "USD", asOf, formationDate,
      scope: "A standard domestic LLC in the formation state, remaining active through the first anniversary. The estimate assumes the snapshot rates and rules remain in effect.",
      excludes: ["EIN.LLC service fees", "commercial registered-agent fees", "optional expedite and alternate filing routes", "late fees", "activity- or nexus-dependent taxes and licensing", "local and other-state charges"],
    };
    if (formationDate < asOf) return {
      ...base, status: "historical_date_not_covered", formation: null, firstYearStateTotalCents: null,
      firstYear: { coverage: "unknown", missing: ["Historical rates and rules for the supplied date"] },
    };
    const charge = formationCharge(row, memberCount);
    if (formationDate.endsWith("-02-29")) return {
      ...base, status: "planning_estimate", formation: charge, firstYearStateTotalCents: null,
      firstYear: { coverage: "unknown", missing: ["Applicable anniversary date for a February 29 formation"] },
    };
    const through = `${Number(formationDate.slice(0, 4)) + 1}${formationDate.slice(4)}`;
    const window = { from: formationDate, through, inclusive: true };
    if (state !== "DE" && state !== "WY") return {
      ...base, status: "planning_estimate", formation: charge, firstYearStateTotalCents: null,
      firstYear: { window, coverage: "unknown", missing: [...(charge.reason ? [charge.reason] : []), ...(row.coverageGaps ?? uncovered)] },
    };
    const recurring = annualCharge(state, formationDate, through, annual[state], wyomingAssetsCents);
    const complete = recurring.inWindowCents !== null;
    return {
      ...base, status: "planning_estimate", formation: charge,
      firstYearStateTotalCents: complete ? charge.cents + recurring.inWindowCents : null,
      firstYear: {
        window, coverage: complete ? "complete_for_stated_scope" : "unknown",
        scheduledCharges: [recurring],
        missing: complete ? [] : [recurring.status],
      },
    };
  };
}
