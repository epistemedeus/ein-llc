/** SPDX-License-Identifier: MIT
 * The single command manifest. Help, `help --json`, `schema`, `capabilities`
 * and argument parsing are all derived from this module.
 *
 * Canonical operation IDs are the live service catalog's snake_case IDs
 * (GET /api/v1/service-catalog); `openapiOperationId` maps the camelCase ID in
 * GET /api/agent/v1/openapi.json. Routes match artifacts/api-server at
 * ein-llc-lean bb8be3107d6c4f8da264a33185c1ff2c6aed3cbe.
 */

export const MANIFEST_VERSION = "ein-llc.cli.manifest.v1";
export const ENVELOPE_SCHEMA_VERSION = "ein-llc.cli.v1";
export const CLI_VERSION = "0.2.2";

const TRI = ["yes", "no", "unknown"];

/** Effects a caller can confirm. Read-only and local effects need no confirmation. */
/**
 * The one supported package build. The script name is not an npm lifecycle
 * name and has no pre/post hooks, so `prepack` (which refuses a bare
 * `npm pack` of this directory) never runs for it. scripts/pack.mjs stages the
 * vendored package and runs `npm pack --ignore-scripts` on the stage, whose
 * package.json has no scripts.
 */
export const PACKAGE_BUILD = Object.freeze({
  build: "npm run build:package",
  check: "npm run build:package:check",
  verifyCold: "npm run verify:cold",
  script: "node scripts/pack.mjs",
  refusedBare: "npm pack",
});

export const EFFECTS = ["anonymous_record_write", "provisional_application_write"];

/**
 * What https://ein.llc actually serves, as observed on 2026-11-12 (catalog
 * 2026-10-01, OpenAPI info.version 2026-09-12.1). Per command:
 * - served: the route is in the live catalog and OpenAPI
 * - served_unlisted: the route answers but is not in the documented contract
 * - local: no request
 * - human_only: a human step on the site; the CLI only refuses
 */
export const HOSTED = Object.freeze({
  origin: "https://ein.llc",
  observedOn: "2026-11-12",
  catalogVersion: "2026-10-01",
  openapiInfoVersion: "2026-09-12.1",
  statuses: {
    served: "Route is in the live service catalog and OpenAPI.",
    served_unlisted: "Route answers but is not part of the documented contract.",
    local: "No request.",
    human_only: "A human step on the site. The CLI refuses it.",
  },
  notServed: [
    "x402 paid endpoint (catalog notOfferedOnThisOrigin)",
    "quote_service API (catalog notOfferedOnThisOrigin)",
    "explain_requirement API (catalog notOfferedOnThisOrigin)",
    "agent cancel of an application (no such route; task cancel is local)",
    "agent claim, checkout, payment, signing or filing",
    "agent issue or revoke of status grants (human owner only)",
  ],
});

const HOSTED_STATUS = Object.freeze({
  help: "local",
  version: "local",
  schema: "local",
  capabilities: "served",
  "compare-states": "served",
  "ein-route": "served",
  "compliance deadlines": "served",
  assess: "served",
  prepare: "served",
  "task show": "local",
  "task resume": "served",
  "task cancel": "local",
  status: "served",
  doctor: "served_unlisted",
  claim: "human_only",
  checkout: "human_only",
});

export function hostedStatus(entry) {
  return HOSTED_STATUS[entry.command] ?? "local";
}

/**
 * Thin task layer. Curated task ids map to the component wire ids they use:
 * the live catalog (snake_case), the OpenAPI operationId (camelCase) and,
 * where a task delegates, the activation-continuation command. Recovery is
 * classified per operation against the server's documented contract.
 */
const RECOVERY = Object.freeze({
  read: { class: "read_retry", promise: "Read-only GET. Bounded retry with --retries." },
  local: { class: "local", promise: "No request." },
  assess: {
    class: "no_reconciliation_route",
    promise: "No caller key exists for assessments and a lost reply cannot be read back. The outcome stays unknown (exit 6). Assessing again deliberately creates another anonymous assessment record (no application, payment or filing).",
    persistedBeforeDispatch: "With a task file: origin, task id and operation id (continuation discover record). No request key exists to persist.",
  },
  prepare: {
    class: "caller_key_idempotent_replay",
    promise: "operationId task:<taskId> is a caller-chosen key. Per the live OpenAPI PrepareInput.operationId contract, replaying the same assessment, recipient and stored preparation returns the original application and claim token without writing again, within the server's (unpublished) retention.",
    persistedBeforeDispatch: "origin, operationId and the bound body {assessmentId, intendedEmail, operationId}, written to the 0600 task file by the continuation client before the POST. ein-llc checks the record before it calls the continuation client (a refusal leaves the task file unchanged and sends nothing) and again before the request leaves.",
    survives: "Process restart while the task file and its storage remain. Not host or storage loss.",
  },
  status: { class: "read_retry", promise: "Read-only GET with a human-issued grant." },
  human: { class: "not_dispatched", promise: "Refused locally; nothing is sent." },
});

const TASK_LAYER = Object.freeze({
  help: { task: "meta.help", wire: [], recovery: RECOVERY.local },
  version: { task: "meta.version", wire: [], recovery: RECOVERY.local },
  schema: { task: "meta.schema", wire: [], recovery: RECOVERY.local },
  capabilities: {
    task: "discovery.capabilities",
    // The catalog advertises itself as operation list_agent_business_services
    // (mode http-get, url https://ein.llc/api/v1/service-catalog; also
    // machineEntry.surfaces.catalog). The OpenAPI advertises its own document as
    // getFormationContract.
    wire: [{ component: "catalog", id: "list_agent_business_services" }, { component: "openapi", id: "getFormationContract" }],
    recovery: RECOVERY.read,
  },
  "compare-states": { task: "knowledge.compare_states", wire: [{ component: "catalog", id: "compare_states" }, { component: "openapi", id: "compareStates" }], recovery: RECOVERY.read },
  "ein-route": { task: "knowledge.ein_route", wire: [{ component: "catalog", id: "explain_ein_route" }, { component: "openapi", id: "explainEinRoute" }], recovery: RECOVERY.read },
  "compliance deadlines": {
    task: "knowledge.compliance_deadlines",
    wire: [
      { component: "catalog", id: "get_compliance_deadlines" }, { component: "openapi", id: "getComplianceDeadlines" },
      { component: "catalog", id: "get_compliance_calendar", variant: "ics" }, { component: "openapi", id: "getComplianceCalendar", variant: "ics" },
    ],
    recovery: RECOVERY.read,
  },
  assess: {
    task: "formation.assess",
    wire: [
      { component: "catalog", id: "assess_formation_need" }, { component: "openapi", id: "assessFormation" },
      { component: "activation-continuation", id: "assess", when: "task file" }, { component: "ein-formation-http-client", id: "FormationHttpClient.assess", when: "no task file" },
    ],
    recovery: RECOVERY.assess,
  },
  prepare: {
    task: "formation.prepare_for_human_claim",
    wire: [{ component: "catalog", id: "prepare_application" }, { component: "openapi", id: "prepareApplication" }, { component: "activation-continuation", id: "prepare" }],
    recovery: RECOVERY.prepare,
  },
  "task show": { task: "task.show", wire: [{ component: "activation-continuation", id: "show" }], recovery: RECOVERY.local },
  "task resume": {
    task: "task.resume",
    wire: [{ component: "catalog", id: "prepare_application" }, { component: "openapi", id: "prepareApplication" }, { component: "activation-continuation", id: "resume" }],
    recovery: RECOVERY.prepare,
  },
  "task cancel": { task: "task.cancel_local", wire: [{ component: "activation-continuation", id: "cancel" }], recovery: RECOVERY.local },
  status: {
    task: "formation.status",
    wire: [{ component: "catalog", id: "get_application_status" }, { component: "openapi", id: "getApplicationStatus" }, { component: "ein-formation-http-client", id: "FormationHttpClient.status" }],
    recovery: RECOVERY.status,
  },
  doctor: { task: "meta.doctor", wire: [{ component: "http", id: "GET /api/healthz", listed: false }], recovery: RECOVERY.read },
  claim: { task: "human.claim", wire: [{ component: "catalog", id: "request_operator_action" }, { component: "openapi", id: "claimApplication", authority: "human (FirebaseIdToken)" }], recovery: RECOVERY.human },
  checkout: { task: "human.checkout", wire: [{ component: "catalog", id: "request_operator_action", payment: "human-checkout" }], recovery: RECOVERY.human },
});

export function taskLayer(entry) {
  return TASK_LAYER[entry.command] ?? { task: entry.command, wire: [], recovery: RECOVERY.local };
}

export const GROUP_SUMMARIES = Object.freeze({
  meta: "Help, version, schema and doctor.",
  discovery: "What the origin serves, from its live catalog and OpenAPI.",
  knowledge: "Read-only reference answers (no credentials).",
  formation: "The task journey: assess, prepare, status.",
  task: "The local 0600 task record and recovery.",
  human_only: "Human steps the CLI refuses.",
});

/** Flags accepted by every command. */
export const GLOBAL_FLAGS = Object.freeze([
  { name: "origin", type: "string", description: "API origin, scheme and host only (default EIN_LLC_ORIGIN or https://ein.llc). http is allowed only for loopback." },
  { name: "timeout-ms", type: "integer", min: 1, max: 60000, description: "Per-request deadline (default 15000, max 60000)." },
  { name: "max-response-bytes", type: "integer", min: 1, max: 4194304, description: "Per-response bound (default 1048576, max 4194304)." },
  { name: "retries", type: "integer", min: 0, max: 3, description: "Bounded retries for read-only GETs on unavailable or rate_limited (default 0, backoff 250 ms doubling)." },
  { name: "correlation-id", type: "string", pattern: "^ae:corr:v1:[A-Za-z0-9_-]{22}$", description: "Optional non-authorizing correlation id (Agent Entry task-continuation v1 format). Echoed as correlationId; never sent to the server, never a credential." },
  { name: "json", type: "switch", description: "Machine output. Already the default; accepted for clarity." },
  { name: "help", alias: "h", type: "switch", description: "Show help for the command." },
]);

/**
 * Authoritative schemas are referenced, not copied. The request and response
 * shapes are owned by EIN.LLC's OpenAPI (GET /api/agent/v1/openapi.json) and
 * enforced locally by the reused public client validators.
 */
export const SCHEMA_SOURCES = Object.freeze({
  openapi: "https://ein.llc/api/agent/v1/openapi.json",
  catalog: "https://ein.llc/api/v1/service-catalog",
  localValidators: "ein-formation-http-client client.mjs (validateAssessmentInput, validateApplicationId)",
});

export const COMMANDS = Object.freeze([
  {
    command: "help",
    group: "meta",
    summary: "List commands. With --json, the machine-readable command index.",
    effect: "local_only",
    auth: "none",
    args: [{ name: "command", required: false, description: "Command to describe." }],
    flags: [],
  },
  {
    command: "version",
    group: "meta",
    summary: "CLI, manifest and envelope versions.",
    effect: "local_only",
    auth: "none",
    flags: [],
  },
  {
    command: "schema",
    group: "meta",
    summary: "Input/output contract of one command, or the whole manifest.",
    effect: "local_only",
    auth: "none",
    args: [{ name: "command", required: false, description: "Command name, for example `ein-route` or `compliance deadlines`." }],
    flags: [],
  },
  {
    command: "capabilities",
    group: "discovery",
    summary: "Read the live service catalog and OpenAPI contract and map them to these commands.",
    effect: "read_only",
    auth: "none",
    http: [
      { method: "GET", path: "/api/v1/service-catalog", operationId: "list_agent_business_services" },
      { method: "GET", path: "/api/agent/v1/openapi.json", openapiOperationId: "getFormationContract" },
    ],
    flags: [{ name: "offline", type: "switch", description: "Manifest only. No network." }],
  },
  {
    command: "compare-states",
    group: "knowledge",
    operationId: "compare_states",
    openapiOperationId: "compareStates",
    summary: "Compare sourced LLC state fees.",
    effect: "read_only",
    auth: "none",
    http: { method: "GET", path: "/api/agent/v1/compare-states" },
    flags: [],
  },
  {
    command: "ein-route",
    group: "knowledge",
    operationId: "explain_ein_route",
    openapiOperationId: "explainEinRoute",
    summary: "Explain the IRS EIN channel for these facts.",
    effect: "read_only",
    auth: "none",
    http: { method: "GET", path: "/api/agent/v1/ein-route" },
    flags: [
      { name: "has-ssn-or-itin", param: "hasSsnOrItin", type: "boolean", required: true, description: "Responsible party has an SSN or ITIN." },
      { name: "principal-business-in-us", param: "principalBusinessInUs", type: "boolean", required: true, description: "Principal place of business is in the United States." },
    ],
  },
  {
    command: "compliance deadlines",
    group: "knowledge",
    operationId: "get_compliance_deadlines",
    openapiOperationId: "getComplianceDeadlines",
    summary: "Read dated compliance obligations. --format ics returns the same obligations as a bounded iCalendar string.",
    effect: "read_only",
    auth: "none",
    http: { method: "GET", path: "/api/agent/v1/compliance-deadlines" },
    variants: {
      ics: {
        operationId: "get_compliance_calendar",
        openapiOperationId: "getComplianceCalendar",
        http: { method: "GET", path: "/api/agent/v1/compliance.ics" },
        contentType: "text/calendar",
      },
    },
    flags: [
      { name: "entity-type", param: "entityType", type: "enum", enum: ["single-member-llc", "multi-member-llc", "corporation"], required: true },
      { name: "owner-residency", param: "ownerResidency", type: "enum", enum: ["foreign", "us"], required: true },
      { name: "formation-state", param: "formationState", type: "string", minLength: 1, maxLength: 80, required: true },
      { name: "formation-date", param: "formationDate", type: "date", required: true, description: "YYYY-MM-DD." },
      { name: "reportable-transactions", param: "reportableTransactions", type: "enum", enum: TRI },
      { name: "part-v-transactions", param: "partVTransactions", type: "enum", enum: TRI },
      { name: "format", type: "enum", enum: ["json", "ics"], default: "json", local: true, description: "json (default) or ics." },
    ],
  },
  {
    command: "assess",
    group: "formation",
    operationId: "assess_formation_need",
    openapiOperationId: "assessFormation",
    summary: "Assess a formation need. Without --yes or --confirm-effect it only previews the request (exit 0, nothing sent). With a task file the result is stored in the existing 0600 continuation record.",
    effect: "anonymous_record_write",
    effectNote: "When sent, the server stores an assessment record. No account, payment, filing or checkout.",
    dispatch: "explicit_confirmation",
    auth: "none",
    http: { method: "POST", path: "/api/agent/v1/assessments" },
    input: {
      source: "stdin_or_file",
      maxBytes: 32768,
      schemaRef: "openapi#/components/schemas/AssessmentInput",
      localValidator: "validateAssessmentInput",
      note: "With --task-file, the recipient goes in --intended-email, not in the JSON.",
    },
    flags: [
      { name: "dry-run", type: "switch", description: "Preview only. Wins over --yes." },
      { name: "yes", type: "switch", description: "Confirm this command's effect (anonymous_record_write)." },
      { name: "confirm-effect", type: "enum", enum: EFFECTS, description: "Confirm by naming the exact effect." },
      { name: "input", type: "string", minLength: 1, maxLength: 4096, local: true, description: "Read JSON from this file instead of stdin." },
      { name: "task-file", type: "string", minLength: 1, maxLength: 4096, local: true, description: "Continuation record (mode 0600). Default EIN_CONTINUATION_FILE. Omit for a stateless assessment." },
    ],
  },
  {
    command: "prepare",
    group: "formation",
    operationId: "prepare_application",
    openapiOperationId: "prepareApplication",
    summary: "Bound prepare for the task's stored assessment, recipient and operation id, through tools/activation-continuation. Previews unless confirmed. Stops before the human claim.",
    effect: "provisional_application_write",
    effectNote: "Creates or recovers one provisional application bound to assessmentId + intendedEmail + operationId. No claim, checkout, payment, filing or signing.",
    dispatch: "explicit_confirmation",
    auth: "none",
    http: { method: "POST", path: "/api/agent/v1/applications" },
    flags: [
      { name: "yes", type: "switch", description: "Confirm this command's effect (provisional_application_write)." },
      { name: "confirm-effect", type: "enum", enum: EFFECTS, description: "Confirm by naming the exact effect." },
      { name: "task-file", type: "string", minLength: 1, maxLength: 4096, local: true, description: "Continuation record (mode 0600). Default EIN_CONTINUATION_FILE." },
      { name: "intended-email", type: "string", minLength: 3, maxLength: 320, local: true, description: "Human recipient who will claim. Default EIN_CONTINUATION_INTENDED_EMAIL." },
    ],
  },
  {
    command: "task show",
    group: "task",
    summary: "Show the stored task record (redacted view from tools/activation-continuation). No network.",
    effect: "local_read",
    auth: "none",
    flags: [{ name: "task-file", type: "string", minLength: 1, maxLength: 4096, local: true, description: "Default EIN_CONTINUATION_FILE." }],
  },
  {
    command: "task resume",
    group: "task",
    operationId: "prepare_application",
    openapiOperationId: "prepareApplication",
    summary: "Recover after a lost prepare reply. Without confirmation it sends nothing and reports the stored operation id. With confirmation it sends one replay of that same bound operation (same operationId and body). Stops before the human claim.",
    effect: "provisional_application_write",
    effectNote: "Replays only the stored bound prepare (same assessmentId, intendedEmail, operationId). Never a new operation id.",
    dispatch: "explicit_confirmation",
    auth: "none",
    http: { method: "POST", path: "/api/agent/v1/applications" },
    flags: [
      { name: "yes", type: "switch", description: "Confirm the replay (provisional_application_write)." },
      { name: "confirm-effect", type: "enum", enum: EFFECTS, description: "Confirm by naming the exact effect." },
      { name: "task-file", type: "string", minLength: 1, maxLength: 4096, local: true, description: "Default EIN_CONTINUATION_FILE." },
      { name: "intended-email", type: "string", minLength: 3, maxLength: 320, local: true, description: "Default EIN_CONTINUATION_INTENDED_EMAIL." },
    ],
  },
  {
    command: "task cancel",
    group: "task",
    summary: "Cancel the local task record only. The EIN.LLC protocol has no agent cancel; the server case, if any, is not cancelled.",
    effect: "local_write",
    auth: "none",
    flags: [{ name: "task-file", type: "string", minLength: 1, maxLength: 4096, local: true, description: "Default EIN_CONTINUATION_FILE." }],
  },
  {
    command: "status",
    group: "formation",
    operationId: "get_application_status",
    openapiOperationId: "getApplicationStatus",
    summary: "Read redacted application status with a human-issued grant from EIN_AGENT_GRANT or EIN_AGENT_GRANT_FILE, sent only to EIN_AGENT_GRANT_ORIGIN.",
    effect: "read_only",
    auth: "agent_grant",
    http: { method: "GET", path: "/api/agent/v1/applications/{applicationId}/status" },
    flags: [{ name: "application-id", type: "string", minLength: 1, maxLength: 256, required: true, description: "Application id." }],
  },
  {
    command: "doctor",
    group: "meta",
    summary: "Check health, origin, grant presence (never values) and task file safety.",
    effect: "read_only",
    auth: "none",
    http: { method: "GET", path: "/api/healthz" },
    flags: [{ name: "task-file", type: "string", minLength: 1, maxLength: 4096, local: true, description: "Default EIN_CONTINUATION_FILE." }],
  },
  {
    command: "claim",
    group: "human_only",
    summary: "Always refused (human_step_required). The intended recipient claims at the review URL.",
    effect: "human_only",
    auth: "human_only",
    flags: [{ name: "task-file", type: "string", minLength: 1, maxLength: 4096, local: true, description: "Default EIN_CONTINUATION_FILE; used only to show the review URL." }],
  },
  {
    command: "checkout",
    group: "human_only",
    summary: "Always refused (funded_step_refused). Checkout and payment are human-only.",
    effect: "human_only",
    auth: "human_only",
    flags: [{ name: "task-file", type: "string", minLength: 1, maxLength: 4096, local: true, description: "Default EIN_CONTINUATION_FILE; used only to show the review URL." }],
  },
]);

export function findCommand(name) {
  return COMMANDS.find((entry) => entry.command === name) || null;
}

/** Longest manifest command matching the leading positionals. */
export function matchCommand(positionals) {
  let best = null;
  for (const entry of COMMANDS) {
    const words = entry.command.split(" ");
    if (words.length <= positionals.length && words.every((word, i) => positionals[i] === word)) {
      if (!best || words.length > best.command.split(" ").length) best = entry;
    }
  }
  return best;
}

function flagSchema(flag) {
  switch (flag.type) {
    case "switch":
    case "boolean":
      return { type: "boolean" };
    case "integer":
      return { type: "integer", minimum: flag.min, maximum: flag.max };
    case "enum":
      return { type: "string", enum: [...flag.enum], ...(flag.default ? { default: flag.default } : {}) };
    case "date":
      return { type: "string", format: "date" };
    default:
      return {
        type: "string",
        ...(flag.pattern ? { pattern: flag.pattern } : {}),
        ...(flag.minLength != null ? { minLength: flag.minLength } : {}),
        ...(flag.maxLength != null ? { maxLength: flag.maxLength } : {}),
      };
  }
}

/** JSON Schema of the command's flags, keyed by flag name. */
export function flagsJsonSchema(entry) {
  const properties = {};
  const required = [];
  for (const flag of entry.flags || []) {
    properties[flag.name] = {
      ...flagSchema(flag),
      ...(flag.param ? { "x-query-param": flag.param } : {}),
      ...(flag.description ? { description: flag.description } : {}),
    };
    if (flag.required) required.push(flag.name);
  }
  return { type: "object", additionalProperties: false, properties, required };
}

export function describeCommand(entry) {
  return {
    command: entry.command,
    group: entry.group,
    summary: entry.summary,
    operationId: entry.operationId ?? null,
    openapiOperationId: entry.openapiOperationId ?? null,
    effect: entry.effect,
    ...(entry.effectNote ? { effectNote: entry.effectNote } : {}),
    ...(entry.dispatch ? { dispatch: entry.dispatch } : {}),
    auth: entry.auth,
    hosted: hostedStatus(entry),
    task: taskLayer(entry).task,
    wire: taskLayer(entry).wire,
    recovery: taskLayer(entry).recovery,
    http: entry.http ?? null,
    ...(entry.variants ? { variants: entry.variants } : {}),
    args: entry.args ?? [],
    flags: flagsJsonSchema(entry),
    ...(entry.input ? { input: entry.input } : {}),
    output: { envelope: ENVELOPE_SCHEMA_VERSION },
  };
}

export function helpIndex() {
  const groups = new Map();
  for (const entry of COMMANDS) {
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group).push({ command: entry.command, summary: entry.summary, effect: entry.effect });
  }
  return {
    manifestVersion: MANIFEST_VERSION,
    groups: [...groups].map(([name, commands]) => ({ name, commands })),
    globalFlags: flagsJsonSchema({ flags: GLOBAL_FLAGS }),
  };
}
