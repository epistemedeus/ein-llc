import { z } from "zod";
import { isoDay, rulesAsOf, sources, usJurisdiction } from "./rules.mjs";

const tri = z.enum(["yes", "no", "unknown"]);
export const deadlinesInput = z.strictObject({
  asOf: isoDay.describe("Date to compare against the regular statutory deadlines."),
  entity: z.enum(["active_domestic_llc", "other", "unknown"]),
  formationState: usJurisdiction,
  formationDate: isoDay,
  federal: z.strictObject({
    foreignOwnedUsDisregardedEntity: tri,
    calendarYearUnderIrsRule: tri.describe("Yes if the owner's US filing year is calendar year or the owner has no US filing obligation."),
    reportingYear: z.number().int().min(1900).max(9997),
    relatedPartyTransactions: tri,
    partVTransactions: tri.describe("Includes reportable formation, dissolution, contributions and distributions."),
  }).optional(),
});

const yearOf = day => Number(day.slice(0, 4));
const dayOfWeek = date => new Date(date + "T00:00:00Z").getUTCDay();
const weekend = day => [0, 6].includes(dayOfWeek(day));
function nextDay(day) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function aprilFederalDate(year) {
  const emancipation = `${year}-04-16`;
  const observed = dayOfWeek(emancipation) === 6 ? `${year}-04-15` :
    dayOfWeek(emancipation) === 0 ? `${year}-04-17` : emancipation;
  const regular = `${year}-04-15`;
  let due = regular;
  while (weekend(due) || due === observed) due = nextDay(due);
  return { regular, due };
}

function federalObligation(facts, formationDate, asOf) {
  const base = { obligation: "form_5472_with_pro_forma_1120", sources: [sources.form5472, sources.form1120, sources.aprilHoliday] };
  if (!facts || facts.foreignOwnedUsDisregardedEntity === "unknown") return { ...base, status: "needs_entity_facts" };
  const { reportingYear, calendarYearUnderIrsRule, relatedPartyTransactions, partVTransactions } = facts;
  if (facts.foreignOwnedUsDisregardedEntity === "no") return { ...base, status: "outside_federal_scope" };
  if (reportingYear < yearOf(formationDate) || reportingYear > yearOf(asOf) + 1) return { ...base, status: "invalid_reporting_year" };
  if (calendarYearUnderIrsRule !== "yes") return { ...base, status: "calendar_year_required" };
  if (relatedPartyTransactions === "no" && partVTransactions === "no") return { ...base, status: "no_reportable_transactions_for_stated_year", reportingYear };
  if (relatedPartyTransactions !== "yes" && partVTransactions !== "yes") return { ...base, status: "needs_transaction_facts", reportingYear };
  const { regular, due } = aprilFederalDate(reportingYear + 1);
  return {
    ...base, status: "required_for_stated_year", reportingYear, regular, due,
    relativeToAsOf: due < asOf ? "past_if_unfiled" : due === asOf ? "today" : "upcoming",
    scope: "Calendar-year filer. Covers ordinary weekend and DC Emancipation Day adjustments. Extensions and special relief need separate verification.",
  };
}

function wyomingTimelyDate(scheduled) {
  let day = scheduled;
  // Only New Year's Day and Labor Day can affect a first-of-month deadline
  // or the immediately following business day.
  const year = yearOf(day);
  const newYear = `${year}-01-01`;
  const newYearObserved = dayOfWeek(newYear) === 0 ? `${year}-01-02` : newYear;
  const september = `${year}-09-01`;
  const laborDay = `${year}-09-0${1 + (8 - dayOfWeek(september)) % 7}`;
  while (weekend(day) || day === newYearObserved || day === laborDay) day = nextDay(day);
  return day;
}

export function firstStateDueDate(state, formationDate) {
  const monthDay = state === "WY" ? `${formationDate.slice(5, 7)}-01` : "06-01";
  return `${yearOf(formationDate) + 1}-${monthDay}`;
}

function stateObligation(state, formationDate, asOf) {
  const wyoming = state === "WY";
  if (!wyoming && state !== "DE") return { status: "unsupported_state", state, supportedStates: ["DE", "WY"] };
  const firstScheduled = firstStateDueDate(state, formationDate);
  const firstYear = yearOf(firstScheduled);
  const monthDay = firstScheduled.slice(5);
  const timely = wyoming ? wyomingTimelyDate : day => day;
  let nextScheduled = `${Math.max(firstYear, yearOf(asOf))}-${monthDay}`;
  if (timely(nextScheduled) < asOf) nextScheduled = `${yearOf(nextScheduled) + 1}-${monthDay}`;
  return {
    obligation: wyoming ? "wyoming_annual_report" : "delaware_annual_llc_tax",
    state, status: "ordinary_schedule",
    first: { scheduled: firstScheduled, ordinaryTimelyThrough: timely(firstScheduled) },
    next: { scheduled: nextScheduled, ordinaryTimelyThrough: timely(nextScheduled) },
    sources: wyoming ? [sources.wyoming, sources.wyomingFirst, sources.wyomingTimeliness, sources.wyomingHolidays] : [sources.delaware],
    scope: wyoming ?
      "The first-of-month schedule and ordinary weekend and listed holiday adjustment. Special relief needs separate verification." :
      "June 1 statutory payment date. Pay by that date even if it falls on a weekend. Confirm any officially issued relief separately.",
  };
}

export function getDeadlines(input) {
  const { asOf, formationDate, formationState, entity } = input;
  if (entity !== "active_domestic_llc") return { status: "outside_entity_scope", asOf, rulesAsOf };
  if (formationDate > asOf) return { status: "formation_after_as_of", asOf, rulesAsOf };
  return {
    status: "schedule", asOf, rulesAsOf,
    federal: federalObligation(input.federal, formationDate, asOf),
    state: stateObligation(formationState, formationDate, asOf),
  };
}
