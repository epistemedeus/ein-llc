import { z } from "zod";
import { isoDay, rulesAsOf, sources } from "./rules.mjs";

const text = z.string().trim().min(1).max(200).refine(value => !/[\u0000-\u001f\u007f]/u.test(value));
const address = z.strictObject({
  street: text,
  locality: text.describe("City, state or province, postal code, and full country name for a foreign address."),
});
const activities = [
  "Construction", "Real estate", "Rental & leasing", "Manufacturing", "Transportation & warehousing",
  "Finance & insurance", "Health care & social assistance", "Accommodation & food service",
  "Wholesale, agent/broker", "Wholesale, other", "Retail", "Other",
];

export const ss4Input = z.strictObject({
  entity: z.enum(["foreign_owned_us_disregarded_single_member_llc", "other", "unknown"]),
  purpose: z.enum(["form_5472", "other", "unknown"]),
  employmentAndWithholding: z.enum(["none", "some", "unknown"]),
  previouslyIssuedEin: z.boolean().optional(),
  legalName: text.optional(),
  tradeName: text.optional(),
  careOf: text.optional(),
  mailingAddress: address.optional(),
  physicalAddress: z.union([z.literal("same_as_mailing"), address]).optional(),
  principalLocation: text.describe("Actual principal business location. Use county and state for a US location.").optional(),
  responsibleParty: text.describe("Legal name of the individual who owns or controls the entity.").optional(),
  tinStatus: z.enum(["has_ssn_or_itin", "no_tin_and_ineligible", "unknown"]).optional()
    .describe("Do not send an actual SSN or ITIN. Enter it manually on the form if applicable."),
  businessStart: isoDay.optional(),
  closingMonth: z.number().int().min(1).max(12).optional(),
  activity: z.enum(activities).optional(),
  otherActivity: text.optional().describe("Specify the activity if line 16 uses Other."),
  principalGoodsOrServices: text.optional(),
});

export function draftSs4(input) {
  const base = { asOf: rulesAsOf, sources: [sources.ss4, sources.ss4Form] };
  const qualifiers = [
    ["entity", "foreign_owned_us_disregarded_single_member_llc"],
    ["purpose", "form_5472"],
    ["employmentAndWithholding", "none"],
  ];
  const unsupported = qualifiers.filter(([key, supported]) => input[key] !== supported && input[key] !== "unknown").map(([key]) => key);
  if (input.previouslyIssuedEin === true) unsupported.push("previouslyIssuedEin");
  if (unsupported.length) return { ...base, status: "unsupported", unsupported };
  const missing = qualifiers.filter(([key]) => input[key] === "unknown").map(([key]) => key);
  if (missing.length) return { ...base, status: "needs_facts", missing };

  const lines = {};
  function set(line, value, requiredInput) {
    if (value === undefined) missing.push(requiredInput);
    lines[line] = value ?? null;
  }
  set("1", input.legalName, "legalName");
  lines["2"] = input.tradeName ?? "N/A";
  lines["3"] = input.careOf ?? "N/A";
  set("4a", input.mailingAddress?.street, "mailingAddress");
  lines["4b"] = input.mailingAddress?.locality ?? null;
  const physical = input.physicalAddress === "same_as_mailing" ? input.mailingAddress : input.physicalAddress;
  if (physical && /\b(?:p\.?\s*o\.?|post office)\s*box\b/i.test(physical.street)) {
    return { ...base, status: "invalid_facts", invalid: ["physicalAddress"] };
  }
  set("5a", input.physicalAddress === "same_as_mailing" ? "N/A" : physical?.street, "physicalAddress");
  lines["5b"] = input.physicalAddress === "same_as_mailing" ? "N/A" : physical?.locality ?? null;
  set("6", input.principalLocation, "principalLocation");
  set("7a", input.responsibleParty, "responsibleParty");
  const needsTinEntry = input.tinStatus === "has_ssn_or_itin";
  set("7b", needsTinEntry ? "[Enter SSN or ITIN directly on the form]" :
    input.tinStatus === "no_tin_and_ineligible" ? "foreign" : undefined, "tinStatus");
  Object.assign(lines, {
    "8a": "Yes", "8b": 1, "8c": "Yes",
    "9a": { box: "Other", detail: "Foreign-owned U.S. disregarded entity-Form 5472" },
    "9b": "N/A",
    "10": { box: "Other", detail: "Foreign-owned U.S. disregarded entity filing Form 5472" },
  });
  set("11", input.businessStart, "businessStart");
  set("12", input.closingMonth, "closingMonth");
  Object.assign(lines, {
    "13": { agricultural: 0, household: 0, other: 0 },
    "14": null,
    "15": "N/A",
  });
  set("16", input.activity, "activity");
  if (input.activity === "Other") {
    if (!input.otherActivity) missing.push("otherActivity");
    lines["16"] = { box: "Other", detail: input.otherActivity ?? null };
  }
  set("17", input.principalGoodsOrServices, "principalGoodsOrServices");
  set("18", input.previouslyIssuedEin === false ? "No" : undefined, "previouslyIssuedEin");
  return {
    ...base,
    status: missing.length ? "needs_facts" : "draft_for_owner_review",
    lines,
    missing,
    ownerActions: [
      ...(needsTinEntry ? ["Complete line 7b directly on the form."] : []),
      "Verify the entries, add the applicant contact details and sign and date the form yourself. Leave the third-party designee blank unless you choose to appoint one.",
    ],
  };
}
