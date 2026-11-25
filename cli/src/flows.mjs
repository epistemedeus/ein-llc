/** SPDX-License-Identifier: MIT
 * Writes, task continuation, grant status, doctor and the human-only refusals.
 *
 * Reuse, no second client family:
 * - stateless assess and grant status: FormationHttpClient (tools/public-ein-http-client)
 * - grant loading: lib/grant.mjs loadGrantToken (env or 0600 file, exact origin)
 * - bound prepare, resume, show, cancel and the 0600 task record:
 *   executeCommand + readContinuation (tools/activation-continuation)
 *
 * Boundaries: writes preview unless confirmed; a lost write is unknown_outcome
 * (exit 6) and is never re-sent automatically; nothing here claims, opens
 * checkout, pays, signs or files.
 */
import { randomBytes } from "node:crypto";
import { accessSync, constants as fsConstants, lstatSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";

import { CliError } from "./errors.mjs";
import { readJsonObject, MAX_INPUT_BYTES } from "./input.mjs";
import { continuationClient } from "./locate.mjs";
import { HOSTED, taskLayer } from "./manifest.mjs";

const DEFAULT_GRANT_ORIGIN = "https://ein.llc";
const LANE = "agent_assisted_human";
// The continuation's own QA lane: loopback API origins only (mock servers in tests).
const LOOPBACK_LANE = "disposable_owner_qa";

function laneFor(origin) {
  const { hostname, protocol } = new URL(origin);
  const loopback = protocol === "http:" && (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]");
  return loopback ? LOOPBACK_LANE : LANE;
}
const REPLAY_COMMAND = "ein-llc task resume --confirm-effect provisional_application_write";

function str(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** --yes or --confirm-effect <this command's effect>. A different named effect is refused. */
function confirmed(entry, flags) {
  const named = flags["confirm-effect"];
  if (named !== undefined && named !== entry.effect) {
    throw new CliError({
      code: "effect_not_confirmed",
      field: "confirm-effect",
      message: `--confirm-effect names ${named}, but ${entry.command} has effect ${entry.effect}`,
    });
  }
  return flags.yes === true || named === entry.effect;
}

/** Local preview: what was checked here, and what only the server can know. */
function localPreview(checks, unknown) {
  return {
    kind: "local",
    network: false,
    checked: checks,
    unknownUntilSent: unknown,
    remoteQuote: {
      served: false,
      note: `EIN.LLC serves no agent quote or reservation API (${HOSTED.notServed[1]}). Price and terms are shown to the human at checkout.`,
    },
  };
}

function effects(entry, dispatched) {
  return {
    effect: entry.effect,
    dispatched,
    confirmWith: ["--yes", `--confirm-effect ${entry.effect}`],
    filingAuthorization: false,
    paymentAuthority: false,
  };
}

function redactView(ctx, value) {
  return ctx.pub.redact.redactSecrets(value, ctx.secrets);
}

// ---------- task context (tools/activation-continuation) ----------

function taskFileOf(ctx, flags) {
  return str(flags["task-file"]) ?? str(ctx.env.EIN_CONTINUATION_FILE);
}

/**
 * Resolve the continuation file, task id and caller key, and pre-read the
 * record with the continuation store (O_NOFOLLOW, regular file, mode 0600,
 * owner uid). Bad permissions or a symlink throw continuation_permissions.
 */
async function taskContext(ctx, flags, { create = false } = {}) {
  const file = taskFileOf(ctx, flags);
  if (!file) {
    throw new CliError({ code: "missing_input", field: "task-file", message: "pass --task-file or set EIN_CONTINUATION_FILE" });
  }
  const cont = await continuationClient();
  const absolute = resolve(file);
  const record = cont.store.readContinuation(absolute);
  const envTaskId = str(ctx.env.EIN_CONTINUATION_TASK_ID);
  if (record && envTaskId && record.taskId !== envTaskId) {
    throw new CliError({ code: "task_mismatch", field: "EIN_CONTINUATION_TASK_ID", message: "the task file belongs to a different task id" });
  }
  let taskId = envTaskId ?? record?.taskId ?? null;
  let generated = false;
  if (!taskId) {
    if (!create) {
      throw new CliError({ code: "continuation_absent", field: "task-file", message: "no task record exists at the task file" });
    }
    taskId = `ein-${randomBytes(12).toString("hex")}`;
    generated = true;
  }
  const customerKey = str(ctx.env.EIN_CONTINUATION_CUSTOMER_KEY);
  if (!customerKey) {
    throw new CliError({
      code: "missing_input",
      field: "EIN_CONTINUATION_CUSTOMER_KEY",
      message: "set EIN_CONTINUATION_CUSTOMER_KEY (opaque caller key, 12-128 chars) in the environment",
    });
  }
  const contEnv = {
    EIN_CONTINUATION_FILE: absolute,
    EIN_CONTINUATION_TASK_ID: taskId,
    EIN_CONTINUATION_CUSTOMER_KEY: customerKey,
    EIN_ACTIVATION_BASE_URL: ctx.origin,
    EIN_CONTINUATION_LANE: laneFor(ctx.origin),
    EIN_CONTINUATION_TRANSPORT: "http",
  };
  const email = str(flags["intended-email"]) ?? str(ctx.env.EIN_CONTINUATION_INTENDED_EMAIL);
  if (email) contEnv.EIN_CONTINUATION_INTENDED_EMAIL = email;
  if (ctx.env.EIN_CONTINUATION_REASSESS === "1") contEnv.EIN_CONTINUATION_REASSESS = "1";
  // Grants are deliberately not passed: the continuation never sees EIN_AGENT_GRANT*.
  return {
    cont,
    file: absolute,
    record,
    taskId,
    generated,
    operationId: `task:${taskId}`,
    intendedEmailSet: Boolean(email || record?.intendedEmail),
    contEnv,
  };
}

function taskSummary(tc, record = tc.record) {
  return {
    taskId: tc.taskId,
    operationId: tc.operationId,
    taskFile: tc.file,
    ...(tc.generated ? { generatedTaskId: true } : {}),
    phase: record?.phase ?? null,
    applicationId: record?.applicationId ?? null,
  };
}

/**
 * Pre-dispatch recovery check. Before any non-GET request leaves, re-read the
 * 0600 task file and require the recovery record for this operation:
 * - prepare/resume: origin, operationId and the bound body, which the
 *   continuation client persists before its POST;
 * - assess: origin and operationId (no request key exists for assessments).
 * If the record is not on disk the request is not sent.
 */
/** Exported for tests only. */
export function guardedFetch(ctx, tc, kind) {
  return async (url, init = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    if (method !== "GET") {
      let record = null;
      try {
        record = tc.cont.store.readContinuation(tc.file);
      } catch {
        record = null;
      }
      const path = new URL(url).pathname;
      const base = record && record.operationId === tc.operationId && record.apiOrigin === ctx.origin;
      const ok = kind === "prepare"
        ? base && record.prepareBody?.operationId === tc.operationId &&
          typeof record.prepareBody.assessmentId === "string" && path === record.catalog?.routes?.prepare
        : base;
      if (!ok) {
        tc.guard.refused = true;
        throw new Error("pre-dispatch recovery record missing");
      }
      tc.guard.verified = true;
      tc.guard.dispatches += 1;
    }
    return ctx.fetch(url, init);
  };
}

function recoveryOut(entry, tc) {
  const layer = taskLayer(entry).recovery;
  return {
    class: layer.class,
    operationId: tc.operationId,
    taskId: tc.taskId,
    persistedBeforeDispatch: tc.guard.verified === true,
    ...(layer.survives ? { survives: layer.survives } : {}),
  };
}

/**
 * Recovery preflight, run by ein-llc BEFORE it calls into the continuation
 * client for a write. The continuation persists its record and, if its POST
 * fails, marks the task prepare_uncertain / assess_uncertain inside its own
 * function, so a refusal must happen before that call to leave the file as it
 * was. Checks what the CLI can know in advance:
 * - the task record is readable and bound to this origin and operation id;
 * - prepare/resume: a stored assessment, the catalog's prepare route, and any
 *   stored bound body matching this assessment and operation id (resume of a
 *   lost prepare requires that body);
 * - the task file's directory is writable, so the continuation can persist the
 *   bound body before its POST.
 * Records the continuation itself will reject (absent, unreadable, cancelled,
 * not assessed) are left to it: it refuses those before writing or sending.
 * Returns the exact task file bytes so a later in-flight refusal can restore them.
 * Exported for tests only.
 */
export function preflightRecovery(ctx, tc, kind) {
  let record;
  let bytes;
  try {
    record = tc.cont.store.readContinuation(tc.file);
    bytes = record ? readFileSync(tc.file) : null;
  } catch {
    return { bytes: null };
  }
  if (!record) return { bytes: null };
  const problems = [];
  if (record.operationId !== tc.operationId) problems.push("operationId");
  if (record.apiOrigin !== ctx.origin) problems.push("apiOrigin");
  if (kind === "prepare" && record.assessment) {
    if (typeof record.assessment.id !== "string") problems.push("assessment.id");
    if (typeof record.catalog?.routes?.prepare !== "string") problems.push("catalog.routes.prepare");
    const body = record.prepareBody;
    if (body && (body.operationId !== tc.operationId || body.assessmentId !== record.assessment.id)) problems.push("prepareBody");
    if (record.phase === "prepare_uncertain" && !body) problems.push("prepareBody");
  }
  try {
    accessSync(dirname(resolve(tc.file)), fsConstants.W_OK);
  } catch {
    problems.push("taskFileDirectoryWritable");
  }
  if (problems.length) {
    throw new CliError({
      code: "recovery_record_unavailable",
      message: "The task file cannot hold this operation's recovery record, so nothing was sent and the task file was not changed.",
      context: { taskId: tc.taskId, operationId: tc.operationId, stage: "preflight", missing: [...new Set(problems)], dispatched: false, taskFileChanged: false },
    });
  }
  return { bytes };
}

/**
 * After an in-flight guard refusal the continuation may already have marked the
 * task uncertain although nothing was sent. Put the pre-call bytes back through
 * the continuation's own atomic 0600 writer and confirm they are identical.
 */
function restoreTaskFile(tc, bytes) {
  if (!bytes) return false;
  try {
    tc.cont.store.writeContinuation(tc.file, JSON.parse(bytes.toString("utf8")));
    return readFileSync(tc.file).equals(bytes);
  } catch {
    return false;
  }
}

async function delegate(ctx, tc, command, { stdin, kind = null } = {}) {
  tc.guard = { verified: false, refused: false, dispatches: 0 };
  const snapshot = kind ? preflightRecovery(ctx, tc, kind) : { bytes: null };
  try {
    return await tc.cont.journey.executeCommand(command, {
      env: tc.contEnv,
      fetch: kind ? guardedFetch(ctx, tc, kind) : ctx.fetch,
      stdin: stdin ?? Readable.from([]),
      showClaimUrl: false,
    });
  } catch (error) {
    if (tc.guard.refused) {
      const restored = restoreTaskFile(tc, snapshot.bytes);
      throw new CliError({
        code: "recovery_record_unavailable",
        message: restored
          ? "The recovery record was not on disk at dispatch, so the request was not sent. The task file was restored to its bytes before this command."
          : "The recovery record was not on disk at dispatch, so the request was not sent. The task file could not be restored; treat any uncertain phase in it as not sent.",
        context: { taskId: tc.taskId, operationId: tc.operationId, stage: "dispatch", dispatched: false, taskFileRestored: restored },
      });
    }
    if (error?.name === "ContinuationError" && (error.code === "prepare_uncertain" || error.code === "assess_uncertain")) {
      const prepare = error.code === "prepare_uncertain";
      throw new CliError({
        code: "unknown_outcome",
        message: prepare
          ? "The prepare reply was lost. It was not re-sent."
          : "The assess reply was lost. It was not re-sent.",
        recovery: prepare
          ? null
          : {
              action: "explicit_reassess",
              instruction: "Do not assume an outcome and do not prepare. `ein-llc task show` shows the record; reassess only deliberately with EIN_CONTINUATION_REASSESS=1.",
            },
        context: {
          cause: error.code,
          taskId: tc.taskId,
          operationId: tc.operationId,
          phase: error.code,
          dispatched: "unknown",
          ...(prepare ? { replayWith: REPLAY_COMMAND } : {}),
        },
      });
    }
    throw error;
  }
}

// ---------- human boundary ----------

/**
 * Handback to the human. Only nonsecret native references and the authority
 * the next step needs; never a bearer credential. The claim link (it carries
 * a claim token) stays in the 0600 task file and is referenced, not printed.
 */
function boundary(record) {
  return {
    code: "human_step_required",
    kind: "human_claim",
    observedAt: record?.updatedAt ?? null,
    applicationId: record?.applicationId ?? null,
    reviewUrl: record?.reviewUrl ?? null,
    requiredAuthority: { actor: "intended_recipient", action: "claim", verifiedEmailRequired: true },
    claimLink: {
      stored: typeof record?.claimLinkStored === "boolean" ? record.claimLinkStored : Boolean(record?.claimUrl),
      where: "task file (mode 0600), field claimUrl",
      printed: false,
    },
    then: {
      payment: "human-only checkout on ein.llc after claim",
      status: { requires: "status grant issued by the human owner", supplyVia: ["EIN_AGENT_GRANT", "EIN_AGENT_GRANT_FILE"] },
    },
    execution: "prepared",
    businessAcceptance: "pending the human claim; a prepared case is not a completed formation",
    filingAuthorization: false,
    paymentAuthority: false,
    instruction: "ein-llc stops here. The intended recipient opens the review URL, claims, and pays at the human checkout. The CLI never claims, opens checkout, pays, signs or files.",
  };
}

function humanStepRefusal(tc, record, what) {
  return new CliError({
    code: "human_step_required",
    message: `${what} refused: application is prepared; the next step is the human claim. Nothing was sent.`,
    recovery: {
      action: "human_claims_at_review_url",
      instruction: "The intended recipient opens the review URL, claims and decides. Use `ein-llc status` with a human-issued grant to read progress.",
      ...(record?.reviewUrl ? { reviewUrl: record.reviewUrl } : {}),
    },
    context: {
      taskId: tc?.taskId ?? null,
      operationId: tc?.operationId ?? null,
      applicationId: record?.applicationId ?? null,
      phase: record?.phase ?? null,
      dispatched: false,
      filingAuthorization: false,
      paymentAuthority: false,
    },
  });
}

function lostPrepareRefusal(tc, record, what) {
  return new CliError({
    code: "unknown_outcome",
    message: `${what}: the last prepare reply was lost. Nothing was sent now.`,
    context: {
      cause: "prepare_uncertain",
      taskId: tc.taskId,
      operationId: record.operationId ?? tc.operationId,
      assessmentId: record.assessment?.id ?? null,
      phase: record.phase,
      dispatched: false,
      replayWith: REPLAY_COMMAND,
    },
  });
}

function refuseCancelled(record) {
  if (record?.phase === "cancelled") {
    throw new CliError({ code: "continuation_cancelled", message: "this task record was cancelled locally" });
  }
}

function prepared(record) {
  return Boolean(record?.applicationId) && record.phase !== "prepare_uncertain";
}

// ---------- assess ----------

export async function assess(ctx, { entry, flags }) {
  const body = await readJsonObject(ctx, flags);
  const validated = ctx.pub.client.validateAssessmentInput(body, { intendedEmail: true });
  if (Buffer.byteLength(JSON.stringify(validated), "utf8") > MAX_INPUT_BYTES) {
    throw new CliError({ code: "body_limit", message: "request body exceeds 32 KiB" });
  }
  const send = confirmed(entry, flags) && flags["dry-run"] !== true;
  const taskFile = taskFileOf(ctx, flags);
  if (!send) {
    return {
      origin: ctx.origin,
      data: {
        dispatched: false,
        effects: effects(entry, false),
        preview: localPreview(
          ["input against validateAssessmentInput (reused public client)", "route and declared effect from the manifest"],
          ["assessment outcome", "server acceptance"],
        ),
        wouldSend: { method: entry.http.method, path: entry.http.path, body: ctx.pub.redact.redactSecrets(validated) },
        effectIfSent: entry.effectNote,
        filingAuthorization: false,
        paymentAuthority: false,
      },
      next: [{
        command: `ein-llc assess --confirm-effect ${entry.effect}${taskFile ? "" : " --task-file FILE"}`,
        why: "Send it. With a task file the assessment is kept in a resumable 0600 record for prepare.",
      }],
    };
  }
  if (taskFile) {
    if (validated.intendedEmail !== undefined) {
      throw new CliError({
        code: "invalid_input",
        field: "intendedEmail",
        message: "with a task file, pass the recipient as --intended-email or EIN_CONTINUATION_INTENDED_EMAIL, not in the JSON",
      });
    }
    const tc = await taskContext(ctx, flags, { create: true });
    refuseCancelled(tc.record);
    // Persist the task record (origin, task id, operation id) before the POST.
    if (!tc.record) await delegate(ctx, tc, "discover");
    const result = await delegate(ctx, tc, "assess", {
      stdin: Readable.from([Buffer.from(JSON.stringify(validated))]),
      kind: "assess",
    });
    return {
      origin: ctx.origin,
      data: {
        dispatched: true,
        effects: effects(entry, true),
        task: taskSummary(tc, result.record),
        recovery: recoveryOut(entry, tc),
        continuation: redactView(ctx, result.view),
        filingAuthorization: false,
        paymentAuthority: false,
      },
      next: [{ command: "ein-llc prepare --task-file FILE --intended-email EMAIL", why: "Preview the bound prepare for a claimable outcome." }],
    };
  }
  const client = new ctx.pub.client.FormationHttpClient({
    origin: ctx.origin,
    fetch: ctx.fetch,
    timeoutMs: ctx.timeoutMs,
    maxResponseBytes: ctx.maxResponseBytes,
  });
  let result;
  try {
    result = await client.assess(validated);
  } catch (error) {
    if (error?.name === "HttpClientError" && error.code === "unavailable") {
      // The POST may have reached the server; it is not re-sent.
      throw new CliError({
        code: "unknown_outcome",
        message: "The assess reply was lost. It was not re-sent.",
        recovery: {
          action: "explicit_reassess",
          instruction: "An assessment record may exist (no application, payment or filing). Re-run assess only deliberately; use --task-file to keep a resumable record.",
        },
        context: { cause: "assess_reply_lost", dispatched: "unknown" },
      });
    }
    throw error;
  }
  return {
    origin: ctx.origin,
    data: { dispatched: true, effects: effects(entry, true), result, filingAuthorization: false, paymentAuthority: false },
  };
}

// ---------- prepare and task commands ----------

export async function prepare(ctx, { entry, flags }) {
  const tc = await taskContext(ctx, flags);
  const record = tc.record;
  if (!record) throw new CliError({ code: "continuation_absent", message: "no task record; run assess with --task-file first" });
  refuseCancelled(record);
  if (prepared(record)) throw humanStepRefusal(tc, record, "prepare");
  if (record.phase === "prepare_uncertain") throw lostPrepareRefusal(tc, record, "prepare will not re-send");
  if (!record.assessment?.id) throw new CliError({ code: "not_assessed", message: "the task has no stored assessment" });
  if (!confirmed(entry, flags)) {
    return {
      origin: ctx.origin,
      operationId: entry.operationId,
      data: {
        dispatched: false,
        effects: effects(entry, false),
        preview: localPreview(
          ["stored assessment id and operation id in the 0600 task file", "recipient present", "route from the stored catalog snapshot"],
          ["whether the server binds or recovers an application", "the application id and claim token"],
        ),
        task: taskSummary(tc),
        wouldSend: {
          method: entry.http.method,
          path: record.catalog?.routes?.prepare ?? entry.http.path,
          body: { assessmentId: record.assessment.id, intendedEmail: tc.intendedEmailSet ? "[set]" : null, operationId: tc.operationId },
        },
        ...(tc.intendedEmailSet ? {} : { missing: ["intended-email"] }),
        effectIfSent: entry.effectNote,
        filingAuthorization: false,
        paymentAuthority: false,
      },
      next: [{ command: `ein-llc prepare --confirm-effect ${entry.effect}`, why: "Send the bound prepare (one request)." }],
    };
  }
  const result = await delegate(ctx, tc, "prepare", { kind: "prepare" });
  return preparedResult(ctx, entry, tc, result);
}

function preparedResult(ctx, entry, tc, result) {
  return {
    origin: ctx.origin,
    operationId: entry.operationId,
    data: {
      dispatched: true,
      effects: effects(entry, true),
      task: taskSummary(tc, result.record),
      recovery: recoveryOut(entry, tc),
      continuation: redactView(ctx, result.view),
      boundary: boundary(result.record),
      filingAuthorization: false,
      paymentAuthority: false,
    },
    next: [{ command: "ein-llc status --application-id ID", why: "After the human claims and issues a status grant (EIN_AGENT_GRANT)." }],
  };
}

export async function taskShow(ctx, { flags }) {
  const tc = await taskContext(ctx, flags);
  const result = await delegate(ctx, tc, "show");
  return {
    data: {
      task: taskSummary(tc, result.record),
      continuation: redactView(ctx, result.view),
      ...(prepared(result.record) ? { boundary: boundary(result.record) } : {}),
    },
  };
}

export async function taskResume(ctx, { entry, flags }) {
  const tc = await taskContext(ctx, flags);
  const record = tc.record;
  if (!record) throw new CliError({ code: "continuation_absent", message: "no task record to resume" });
  refuseCancelled(record);
  if (prepared(record)) throw humanStepRefusal(tc, record, "resume");
  if (record.phase === "prepare_uncertain") {
    if (!confirmed(entry, flags)) throw lostPrepareRefusal(tc, record, "resume needs confirmation to replay");
    // Sends one replay of the stored bound body (same assessmentId, intendedEmail,
    // operationId). The server's documented operationId contract returns the
    // original application without a new write; the CLI does not promise more.
    const result = await delegate(ctx, tc, "resume", { kind: "prepare" });
    return preparedResult(ctx, entry, tc, result);
  }
  const result = await delegate(ctx, tc, "show");
  return {
    data: {
      resumed: false,
      reason: "nothing to replay: no prepare is in flight for this task",
      task: taskSummary(tc, result.record),
      continuation: redactView(ctx, result.view),
    },
  };
}

export async function taskCancel(ctx, { flags }) {
  const tc = await taskContext(ctx, flags);
  const result = await delegate(ctx, tc, "cancel");
  return {
    data: {
      task: taskSummary(tc, result.record),
      localOnly: true,
      serverCaseCancelled: false,
      note: "Only the local task record was cancelled. EIN.LLC has no agent cancel; any server case stays with the human at its review URL.",
      continuation: redactView(ctx, result.view),
    },
  };
}

// ---------- grant status ----------

function declaredGrantOrigin(env) {
  return str(env.EIN_AGENT_GRANT_ORIGIN) ?? DEFAULT_GRANT_ORIGIN;
}

/**
 * Where a status grant comes from (OpenAPI): the application owner, signed in
 * with a Firebase ID token and a verified email, issues a revocable, expiring,
 * status-only AgentGrant (POST /api/agent/v1/applications/{applicationId}/grants,
 * FirebaseIdToken; human only). The agent never mints, refreshes or revokes one.
 */
function grantIssuance(applicationId) {
  const id = typeof applicationId === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(applicationId) ? applicationId : "{applicationId}";
  return {
    actor: "application owner (signed in, verified email)",
    issues: "a status-only AgentGrant for this application",
    reviewUrl: `https://ein.llc/review/${id}`,
    humanApi: `POST /api/agent/v1/applications/${id}/grants (FirebaseIdToken; human only)`,
    supplyVia: ["EIN_AGENT_GRANT", "EIN_AGENT_GRANT_FILE (regular file, mode 0600, owned by this user, not a symlink)"],
    neverVia: ["command-line flags", "URLs", "JSON input", "the task file"],
  };
}

const AUTH_RECOVERY = Object.freeze({
  missing_grant: ["human_issues_grant", "No grant is configured. The human owner issues a status grant; put it in EIN_AGENT_GRANT or a 0600 EIN_AGENT_GRANT_FILE."],
  grant_file_unsafe: ["fix_grant_file", "The grant file was not read. Make EIN_AGENT_GRANT_FILE a regular file, mode 0600, owned by this user, not a symlink, at most 8 KiB. If it is lost, the human owner issues a new grant."],
  grant_malformed: ["human_issues_grant", "The configured grant is empty or contains whitespace or control characters, so it was not sent. Copy the grant the human owner issued exactly, or ask for a new one."],
  grant_origin_mismatch: ["fix_origin", "EIN_AGENT_GRANT_ORIGIN must exactly equal the request origin. The grant was not read or sent. A grant issued on one origin is never sent to another."],
  invalid_grant: ["human_issues_grant", "The server rejected the grant (401: missing, invalid, expired or revoked; the server does not say which). Do not retry with the same grant. The human owner issues a new status grant."],
  insufficient_scope: ["human_issues_grant", "The server refused the grant for this application (403: wrong owner, intended recipient, grant scope or unverified email). The human owner issues a grant for this application, after verifying the email if needed."],
});

function authError(code, message, applicationId, extra = {}) {
  const [action, instruction] = AUTH_RECOVERY[code];
  return new CliError({
    code,
    status: extra.status ?? null,
    message,
    recovery: { action, instruction, grantIssuance: grantIssuance(applicationId) },
    context: { grantSent: extra.grantSent === true, ...(extra.reason ? { reason: extra.reason } : {}), ...(extra.source ? { grantSource: extra.source } : {}) },
  });
}

const MAX_GRANT_FILE_BYTES = 8 * 1024;

/**
 * Why a grant file would be refused, from lstat only (the file is not opened).
 * lib/grant.mjs enforces the same rules with O_NOFOLLOW and fstat but reports
 * every failure as one code; this names the rule without reading the secret.
 */
function grantFileProblem(path) {
  let info;
  try {
    info = lstatSync(resolve(path));
  } catch (error) {
    return error?.code === "ENOENT" ? "missing" : "unreadable";
  }
  if (info.isSymbolicLink()) return "symlink";
  if (!info.isFile()) return "not_regular";
  if ((info.mode & 0o077) !== 0) return "mode";
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) return "owner";
  if (info.size > MAX_GRANT_FILE_BYTES) return "too_large";
  return null;
}

/** Grant from env or 0600 file via lib/grant.mjs, with typed refusals. Never echoes the value. */
function loadStatusGrant(ctx, applicationId) {
  if (declaredGrantOrigin(ctx.env) !== ctx.origin) {
    throw authError("grant_origin_mismatch", "EIN_AGENT_GRANT_ORIGIN does not exactly match the request origin; the grant was not read or sent", applicationId);
  }
  const fromEnv = typeof ctx.env.EIN_AGENT_GRANT === "string" ? ctx.env.EIN_AGENT_GRANT.trim() : "";
  const filePath = typeof ctx.env.EIN_AGENT_GRANT_FILE === "string" ? ctx.env.EIN_AGENT_GRANT_FILE.trim() : "";
  const source = fromEnv ? "EIN_AGENT_GRANT" : filePath ? "EIN_AGENT_GRANT_FILE" : null;
  if (!source) {
    throw authError("missing_grant", "a status grant is required (EIN_AGENT_GRANT or EIN_AGENT_GRANT_FILE)", applicationId, { status: 401 });
  }
  if (source === "EIN_AGENT_GRANT_FILE") {
    const reason = grantFileProblem(filePath);
    if (reason) throw authError("grant_file_unsafe", `EIN_AGENT_GRANT_FILE refused (${reason}); it was not read`, applicationId, { reason, source });
  }
  try {
    return ctx.pub.grant.loadGrantToken({ env: ctx.env, required: true, origin: ctx.origin });
  } catch {
    // lstat passed, so the remaining refusals are the token shape (or a race on the file).
    throw authError("grant_malformed", `${source} does not hold a valid grant; it was not sent`, applicationId, { source });
  }
}

export async function status(ctx, { flags }) {
  const applicationId = flags["application-id"];
  const grant = loadStatusGrant(ctx, applicationId);
  ctx.secrets.push(...ctx.pub.redact.collectSecrets(grant));
  const client = new ctx.pub.client.FormationHttpClient({
    origin: ctx.origin,
    fetch: ctx.fetch,
    timeoutMs: ctx.timeoutMs,
    maxResponseBytes: ctx.maxResponseBytes,
    grantToken: grant,
    grantOrigin: ctx.origin,
  });
  let result;
  try {
    result = await client.status({ applicationId });
  } catch (error) {
    if (error?.name === "HttpClientError" && (error.code === "invalid_grant" || error.code === "insufficient_scope")) {
      throw authError(error.code, error.message, applicationId, { status: error.status, grantSent: true });
    }
    throw error;
  }
  return { origin: ctx.origin, data: redactView(ctx, result) };
}

// ---------- doctor ----------

function fileCheck(id, path, { required = false } = {}) {
  if (!path) return { id, ok: !required, configured: false };
  let info;
  try {
    info = lstatSync(path);
  } catch {
    return { id, ok: false, configured: true, exists: false };
  }
  const ownerOnly = (info.mode & 0o077) === 0;
  const owner = typeof process.getuid === "function" ? info.uid === process.getuid() : null;
  const regular = info.isFile() && !info.isSymbolicLink();
  return {
    id,
    ok: regular && ownerOnly && owner !== false,
    configured: true,
    exists: true,
    regularFile: regular,
    symlink: info.isSymbolicLink(),
    mode: `0${(info.mode & 0o777).toString(8)}`,
    ownerOnly,
    ownedByCaller: owner,
  };
}

export async function doctor(ctx, { flags }) {
  const checks = [];
  try {
    const t = ctx.pub.http.createTransport({ origin: ctx.origin, fetch: ctx.fetch, timeoutMs: ctx.timeoutMs, maxResponseBytes: ctx.maxResponseBytes });
    const { status: httpStatus } = await t.request("GET", "/api/healthz", { success: [200] });
    checks.push({ id: "health", ok: true, status: httpStatus });
  } catch (error) {
    checks.push({ id: "health", ok: false, code: typeof error?.code === "string" ? error.code : "unavailable" });
  }
  const env = ctx.env;
  const grantFile = str(env.EIN_AGENT_GRANT_FILE);
  checks.push({
    id: "grant",
    ok: true,
    envPresent: Boolean(str(env.EIN_AGENT_GRANT)),
    filePresent: Boolean(grantFile),
    originMatches: declaredGrantOrigin(env) === ctx.origin,
    note: "Presence only. The grant value and file contents are never read by doctor.",
  });
  if (grantFile) checks.push(fileCheck("grant_file", resolve(grantFile)));
  const taskFile = taskFileOf(ctx, flags);
  checks.push(fileCheck("task_file", taskFile ? resolve(taskFile) : null));
  checks.push({
    id: "task_env",
    ok: true,
    customerKeyPresent: Boolean(str(env.EIN_CONTINUATION_CUSTOMER_KEY)),
    taskIdPresent: Boolean(str(env.EIN_CONTINUATION_TASK_ID)),
    intendedEmailPresent: Boolean(str(env.EIN_CONTINUATION_INTENDED_EMAIL)),
  });
  return { origin: ctx.origin, data: { healthy: checks.every((c) => c.ok), checks } };
}

// ---------- human-only ----------

async function reviewRecord(ctx, flags) {
  const file = taskFileOf(ctx, flags);
  if (!file) return null;
  try {
    const { store } = await continuationClient();
    return store.readContinuation(resolve(file));
  } catch {
    return null;
  }
}

export async function claim(ctx, { flags }) {
  const record = await reviewRecord(ctx, flags);
  throw humanStepRefusal(record ? { taskId: record.taskId, operationId: record.operationId } : null, record, "claim");
}

export async function checkout(ctx, { flags }) {
  const record = await reviewRecord(ctx, flags);
  throw new CliError({
    code: "funded_step_refused",
    message: "checkout refused: checkout, payment and signing are human-only. Nothing was sent.",
    recovery: {
      action: "human_pays_at_checkout",
      instruction: "The claimed human owner reviews the offer and pays at the EIN.LLC checkout from the review URL.",
      ...(record?.reviewUrl ? { reviewUrl: record.reviewUrl } : {}),
    },
    context: {
      applicationId: record?.applicationId ?? null,
      dispatched: false,
      filingAuthorization: false,
      paymentAuthority: false,
    },
  });
}
