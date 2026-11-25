/** SPDX-License-Identifier: MIT
 * Typed CLI errors, stable exit codes and recovery guidance.
 * Codes from tools/public-ein-http-client (HttpClientError, grant loader) and
 * tools/activation-continuation (ContinuationError) pass through unchanged
 * unless listed in REMAP (lost writes become unknown_outcome).
 */

/** Exit categories. Documented in README.md; do not renumber within v1. */
export const EXIT = Object.freeze({
  ok: 0,
  internal: 1,
  input: 2,
  auth: 3,
  unavailable: 4,
  response: 5,
  unknown_outcome: 6,
  not_found: 7,
});

const CATEGORY_BY_CODE = Object.freeze({
  // input (2)
  invalid_input: "input",
  secret_field_rejected: "input",
  body_limit: "input",
  conflict: "input",
  unknown_command: "input",
  unknown_flag: "input",
  missing_input: "input",
  not_in_slice: "input",
  effect_not_confirmed: "input",
  recovery_record_unavailable: "input",
  continuation_permissions: "input",
  continuation_unreadable: "input",
  continuation_absent: "input",
  continuation_cancelled: "input",
  unsupported_continuation: "input",
  task_mismatch: "input",
  task_payload_mismatch: "input",
  customer_mismatch: "input",
  lane_refused: "input",
  transport_mismatch: "input",
  recipient_required: "input",
  recipient_changed: "input",
  not_assessed: "input",
  not_prepared: "input",
  prepare_refused: "input",
  task_input_required: "input",
  identity_changed: "input",
  assessment_expired: "input",
  assessment_already_bound: "input",
  // auth and human authority (3)
  missing_grant: "auth",
  invalid_grant: "auth",
  insufficient_scope: "auth",
  grant_origin_mismatch: "auth",
  grant_file_unsafe: "auth",
  grant_malformed: "auth",
  origin_mismatch: "auth",
  human_step_required: "auth",
  funded_step_refused: "auth",
  // unavailable (4)
  unavailable: "unavailable",
  rate_limited: "unavailable",
  timeout: "unavailable",
  deadline_exceeded: "unavailable",
  // response (5)
  invalid_response: "response",
  output_limit: "response",
  capability_unavailable: "response",
  unsupported_schema: "response",
  contract_mismatch: "response",
  unsupported_terms: "response",
  unsupported_route: "response",
  unsupported_state: "response",
  terms_changed: "response",
  redirect_refused: "response",
  // unknown outcome (6)
  unknown_outcome: "unknown_outcome",
  // not found (7)
  not_found: "not_found",
  // internal (1)
  public_client_missing: "internal",
  continuation_client_missing: "internal",
  client_error: "internal",
  internal_error: "internal",
});

/** Lost write responses from the continuation client keep their cause. */
const REMAP = Object.freeze({
  prepare_uncertain: "unknown_outcome",
  assess_uncertain: "unknown_outcome",
});

const TASK_RESUME = "ein-llc task resume";

const RECOVERY_BY_CODE = Object.freeze({
  invalid_input: ["fix_input", "Run `ein-llc schema <command>` and correct the named field. Nothing was changed on the server."],
  secret_field_rejected: ["fix_input", "Remove secret-shaped fields. EIN.LLC never accepts SSNs, passports, tokens or documents from an agent."],
  body_limit: ["fix_input", "Reduce the JSON input below 32 KiB."],
  conflict: ["fix_input", "The request conflicts with current server state. Re-read the contract with `ein-llc capabilities`."],
  unknown_command: ["list_commands", "Run `ein-llc help --json` for the supported commands."],
  unknown_flag: ["fix_input", "Run `ein-llc schema <command>` for the supported flags."],
  missing_input: ["provide_input", "Supply the named input (stdin, --input, --task-file or the documented environment variable). This command never prompts."],
  not_in_slice: ["use_existing_client", "This operation is not offered by ein-llc. Use the documented existing client."],
  effect_not_confirmed: ["confirm_effect", "Pass --confirm-effect with the exact effect named by `ein-llc schema <command>`, or --yes."],
  recovery_record_unavailable: ["fix_file_mode", "The 0600 task file could not hold the recovery record, so nothing was sent. Fix the file or its directory, then run `ein-llc task show` before trying again."],
  continuation_permissions: ["fix_file_mode", "Keep the task file a regular owner-only file (mode 0600), not a symlink, owned by this user."],
  continuation_unreadable: ["fix_file_mode", "Point --task-file or EIN_CONTINUATION_FILE at the owner-only JSON file for this task."],
  continuation_absent: ["assess", "No task record exists yet. Run `ein-llc assess --yes --task-file FILE` first."],
  continuation_cancelled: ["stop", "This task record was cancelled locally. Start a new task file for a new task."],
  unsupported_continuation: ["stop", "The task file is not an ein.activation-continuation.v1 record. Use a new task file."],
  task_mismatch: ["stop", "The task file belongs to a different task or operation. Use the original task id, or a new file for a new task."],
  task_payload_mismatch: ["stop", "This task already has different facts. Use a new task file for a changed task."],
  customer_mismatch: ["stop", "The task file belongs to a different caller key. Do not reuse it."],
  lane_refused: ["stop", "Agent-assisted human journeys need the https origin; instant agent checkout is refused."],
  transport_mismatch: ["stop", "Resume with the transport stored for this task."],
  recipient_required: ["human_supplies_recipient", "Pass --intended-email or set EIN_CONTINUATION_INTENDED_EMAIL to the human who will claim. Do not invent one."],
  recipient_changed: ["stop", "This task is bound to a different recipient. Do not prepare a second application."],
  not_assessed: ["assess", "Run `ein-llc assess --confirm-effect anonymous_record_write --task-file FILE` first."],
  not_prepared: ["prepare_for_human_claim", "This task has no application yet."],
  prepare_refused: ["stop", "The assessment outcome is terminal or unknown. Do not prepare, claim or pay."],
  task_input_required: ["provide_input", "Pipe one JSON task object."],
  identity_changed: ["stop", "The server returned a different application for this operation. Do not replace it."],
  assessment_expired: ["explicit_reassess", "The assessment expired before a case existed. Reassess deliberately; the operation id is kept."],
  assessment_already_bound: ["status_when_granted", "The server kept the existing case. Use status with a human-issued grant. Do not prepare again."],
  capability_unavailable: ["rediscover", "The current catalog does not offer this operation. Run `ein-llc capabilities`."],
  unsupported_schema: ["stop", "The origin does not publish the supported catalog or OpenAPI version."],
  contract_mismatch: ["stop", "Catalog and OpenAPI disagree, or a route moved. Do not call either path."],
  unsupported_terms: ["stop", "The catalog does not keep filing and payment authority off this route. Do not continue."],
  unsupported_route: ["stop", "Refuse this catalog route."],
  unsupported_state: ["human_reviews_existing_case", "The application is in a state this client cannot reconcile. The human reviews the case."],
  terms_changed: ["human_reviews_current_offer", "Catalog terms changed after prepare. The human reviews the current offer at the review URL."],
  redirect_refused: ["stop", "Redirects and other origins are refused. Call the recorded origin."],
  missing_grant: ["human_issues_grant", "Status needs a human-issued, status-scoped AgentGrant in EIN_AGENT_GRANT or EIN_AGENT_GRANT_FILE (mode 0600). Grants are never accepted as flags."],
  invalid_grant: ["human_issues_grant", "The grant is invalid, expired or revoked. The human owner issues a new status grant."],
  insufficient_scope: ["human_issues_grant", "The grant is not scoped to this application. The human owner issues one for this application."],
  grant_file_unsafe: ["fix_grant_file", "The grant file was not read. Make EIN_AGENT_GRANT_FILE a regular file, mode 0600, owned by this user, not a symlink. If it is lost, the human owner issues a new grant."],
  grant_malformed: ["human_issues_grant", "The configured grant is not a valid token and was not sent. The human owner issues a new status grant."],
  grant_origin_mismatch: ["fix_origin", "EIN_AGENT_GRANT_ORIGIN must exactly equal the request origin. The grant was not read or sent."],
  origin_mismatch: ["fix_origin", "Use the origin recorded for this task. A different origin never receives this task's grant or claim link."],
  human_step_required: ["human_claims_at_review_url", "This CLI stops before the human claim. The intended recipient opens the review URL, claims and decides. Nothing was sent."],
  funded_step_refused: ["human_pays_at_checkout", "Checkout and payment are human-only on EIN.LLC. This CLI never opens checkout, pays or signs. Nothing was sent."],
  unavailable: ["retry_later", "Read-only GET: safe to retry. Use --retries N (max 3) or retry later. If the response may exceed the bound, raise --max-response-bytes (max 4194304)."],
  rate_limited: ["retry_later", "Rate limited. The server window is 60 seconds; retry after it. Read-only GET: safe to retry."],
  deadline_exceeded: ["retry_same_command", "The command budget ran out before dispatch. Run the same command again; the task and operation id are kept."],
  timeout: ["retry_later", "Read-only request timed out. Retry later or raise --timeout-ms."],
  invalid_response: ["check_origin", "The origin did not return the published contract. Check --origin (default https://ein.llc), then run `ein-llc capabilities`."],
  output_limit: ["narrow_request", "The result exceeds the CLI output bound. Narrow the request."],
  unknown_outcome: ["task_resume", `A write may have happened. Do not resend. Run \`${TASK_RESUME}\` (no request) to see the stored operation id, then \`${TASK_RESUME} --confirm-effect provisional_application_write\` to send one replay of that same bound operation. The server's operationId contract returns the original application without a new write; nothing here promises more than that.`],
  not_found: ["check_origin", "The resource was not found on this origin."],
  public_client_missing: ["reinstall", "Run from the repository checkout or a packed archive that vendors ein-formation-http-client."],
  continuation_client_missing: ["reinstall", "Run from the repository checkout or a packed archive that vendors ein-activation-continuation."],
  client_error: ["report", "Unexpected client failure. Re-run with the same input; report the command and exit code if it persists."],
  internal_error: ["report", "Unexpected client failure. Report the command and exit code."],
});

const RETRYABLE_READ_CODES = new Set(["unavailable", "rate_limited", "timeout"]);

export class CliError extends Error {
  constructor({ code = "internal_error", message, status = null, field = null, retryable, recovery = null, context = null } = {}) {
    super(message || code);
    this.name = "CliError";
    this.code = code;
    this.status = status;
    this.field = field;
    this.retryable = retryable === true;
    this.recovery = recovery;
    this.context = context;
  }
}

export function categoryOf(code) {
  return CATEGORY_BY_CODE[code] || "internal";
}

export function exitCodeOf(code) {
  return EXIT[categoryOf(code)];
}

export function recoveryOf(code) {
  const [action, instruction] = RECOVERY_BY_CODE[code] || RECOVERY_BY_CODE.internal_error;
  return { action, instruction };
}

export function knownCodes() {
  return Object.keys(CATEGORY_BY_CODE);
}

function safeRecovery(value, redact) {
  if (!value || typeof value !== "object" || typeof value.action !== "string") return null;
  const out = { action: value.action, instruction: redact(String(value.instruction ?? "")).slice(0, 500) };
  if (typeof value.reviewUrl === "string") out.reviewUrl = redact(value.reviewUrl);
  if (value.grantIssuance && typeof value.grantIssuance === "object") out.grantIssuance = JSON.parse(redact(JSON.stringify(value.grantIssuance)));
  return out;
}

/**
 * Normalize any thrown value into the public error object.
 * `readOnly` marks a safe GET, which makes transport failures retryable.
 * Arbitrary causes are never echoed (they may carry paths or credentials).
 */
export function toPublicError(error, { readOnly = false, redact = (s) => s } = {}) {
  let code = "internal_error";
  let message = "unexpected failure";
  let status = null;
  let field = null;
  let recovery = null;
  let context = null;
  let cause = null;
  if (error instanceof CliError) {
    ({ code, status, field, context } = error);
    message = error.message;
    recovery = safeRecovery(error.recovery, redact);
  } else if (error && (error.name === "HttpClientError" || error.name === "ContinuationError") && typeof error.code === "string") {
    const mapped = REMAP[error.code];
    if (mapped) cause = error.code;
    code = mapped || (CATEGORY_BY_CODE[error.code] ? error.code : "client_error");
    message = error.message;
    status = error.status ?? null;
    if (error.name === "ContinuationError" && !mapped) recovery = safeRecovery(error.recovery, redact);
  } else if (error && typeof error.code === "string" && error.code === "missing_grant") {
    // tools/public-ein-http-client/lib/grant.mjs throws plain Errors with this code.
    code = "missing_grant";
    message = error.message;
    status = error.status ?? 401;
  }
  const retryable = (error instanceof CliError && error.retryable) || (readOnly && RETRYABLE_READ_CODES.has(code));
  return {
    code,
    category: categoryOf(code),
    message: redact(String(message)).slice(0, 500),
    status,
    ...(field ? { field } : {}),
    ...(cause ? { cause } : {}),
    retryable,
    recovery: recovery || recoveryOf(code),
    ...(context ? { context } : {}),
  };
}

export function isRetryableRead(publicError) {
  return RETRYABLE_READ_CODES.has(publicError.code);
}
