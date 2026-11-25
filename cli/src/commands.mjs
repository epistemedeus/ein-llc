/** SPDX-License-Identifier: MIT
 * Command handlers. Read-only GETs go through the public client's transport
 * (tools/public-ein-http-client). Writes and task commands live in flows.mjs.
 */
import { CliError, isRetryableRead, toPublicError } from "./errors.mjs";
import {
  CLI_VERSION,
  COMMANDS,
  EFFECTS,
  ENVELOPE_SCHEMA_VERSION,
  MANIFEST_VERSION,
  describeCommand,
  findCommand,
  helpIndex,
  matchCommand,
} from "./manifest.mjs";
import { assess, checkout, claim, doctor, prepare, status, taskCancel, taskResume, taskShow } from "./flows.mjs";
import { runtimeInfo } from "./locate.mjs";
import { commandHelpText, groupHelpText, groupNames, helpIndexText } from "./render.mjs";
import { getBoundedText } from "./text.mjs";

const BACKOFF_BASE_MS = 250;

function str(value) {
  return typeof value === "string" ? value : null;
}

/** Bounded retry for read-only GETs only. Never used for writes. */
async function withRetries(ctx, fn) {
  const attempts = (ctx.retries ?? 0) + 1;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const publicError = toPublicError(error, { readOnly: true });
      if (attempt + 1 >= attempts || !isRetryableRead(publicError)) throw error;
      ctx.diagnostic(`retrying after ${publicError.code} (attempt ${attempt + 2} of ${attempts})`);
      await ctx.sleep(BACKOFF_BASE_MS * 2 ** attempt);
    }
  }
}

function transport(ctx) {
  return ctx.pub.http.createTransport({
    origin: ctx.origin,
    fetch: ctx.fetch,
    timeoutMs: ctx.timeoutMs,
    maxResponseBytes: ctx.maxResponseBytes,
  });
}

function queryString(entry, flags) {
  const params = new URLSearchParams();
  for (const flag of entry.flags) {
    if (!flag.param || flags[flag.name] === undefined) continue;
    params.set(flag.param, String(flags[flag.name]));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

async function getJson(ctx, entry, flags) {
  const path = `${entry.http.path}${queryString(entry, flags)}`;
  const t = transport(ctx);
  const { payload } = await withRetries(ctx, () => t.request("GET", path, { success: [200] }));
  if (payload === null || typeof payload !== "object") {
    throw new CliError({ code: "invalid_response", message: "expected a JSON object" });
  }
  return payload;
}

function summarizeCatalog(catalog) {
  const operations = Array.isArray(catalog.operations) ? catalog.operations : [];
  return {
    schema: str(catalog.schema),
    catalogVersion: str(catalog.catalogVersion),
    operations: operations.slice(0, 200).map((op) => ({
      id: str(op?.id),
      method: str(op?.method),
      path: str(op?.path),
      mode: str(op?.mode),
    })),
  };
}

function summarizeOpenApi(openapi) {
  const operations = [];
  for (const [path, item] of Object.entries(openapi.paths || {})) {
    for (const [method, op] of Object.entries(item || {})) {
      if (!op || typeof op !== "object" || !str(op.operationId)) continue;
      const schemes = (Array.isArray(op.security) ? op.security : []).flatMap((req) => Object.keys(req || {}));
      operations.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path,
        auth: schemes.includes("FirebaseIdToken") ? "human_only" : schemes.includes("AgentGrant") ? "agent_grant" : "none",
      });
    }
  }
  return {
    openapi: str(openapi.openapi),
    title: str(openapi.info?.title),
    version: str(openapi.info?.version),
    operations: operations.slice(0, 200),
  };
}

/** What the CLI can change, what it needs to do so, and what it never does. */
function effectsSummary() {
  return {
    confirmable: EFFECTS.map((effect) => ({
      effect,
      commands: COMMANDS.filter((entry) => entry.effect === effect).map((entry) => entry.command),
      confirmWith: ["--yes", `--confirm-effect ${effect}`],
    })),
    unconfirmedWrites: "preview",
    grant: { sources: ["EIN_AGENT_GRANT", "EIN_AGENT_GRANT_FILE"], origin: "EIN_AGENT_GRANT_ORIGIN (exact match)", commands: ["status"] },
    humanOnly: COMMANDS.filter((entry) => entry.effect === "human_only").map((entry) => entry.command),
    never: ["claim", "checkout", "payment", "filing", "signing", "server_cancel"],
    filingAuthorization: false,
    paymentAuthority: false,
  };
}

function manifestCommands(catalogIds, openapiIds) {
  const out = [];
  for (const entry of COMMANDS) {
    const rows = [{ variant: null, operationId: entry.operationId, openapiOperationId: entry.openapiOperationId }];
    for (const [variant, v] of Object.entries(entry.variants || {})) {
      rows.push({ variant, operationId: v.operationId, openapiOperationId: v.openapiOperationId });
    }
    for (const row of rows) {
      let availability = "local";
      if (row.operationId) {
        if (!catalogIds) availability = "unchecked_offline";
        else availability = catalogIds.has(row.operationId) && openapiIds.has(row.openapiOperationId) ? "advertised" : "not_advertised";
      }
      out.push({
        command: entry.command,
        ...(row.variant ? { variant: row.variant } : {}),
        operationId: row.operationId ?? null,
        openapiOperationId: row.openapiOperationId ?? null,
        effect: entry.effect,
        auth: entry.auth,
        ...(entry.dispatch ? { dispatch: entry.dispatch } : {}),
        ...(EFFECTS.includes(entry.effect) ? { confirmEffect: entry.effect } : {}),
        availability,
      });
    }
  }
  return out;
}

async function capabilities(ctx, { flags }) {
  if (flags.offline) {
    return { data: { offline: true, manifestVersion: MANIFEST_VERSION, effects: effectsSummary(), commands: manifestCommands(null, null) } };
  }
  const client = new ctx.pub.client.FormationHttpClient({
    origin: ctx.origin,
    fetch: ctx.fetch,
    timeoutMs: ctx.timeoutMs,
    maxResponseBytes: ctx.maxResponseBytes,
  });
  const found = await withRetries(ctx, () => client.discover());
  const catalog = summarizeCatalog(found.catalog);
  const openapi = summarizeOpenApi(found.openapi);
  const catalogIds = new Set(catalog.operations.map((op) => op.id).filter(Boolean));
  const openapiIds = new Set(openapi.operations.map((op) => op.operationId));
  return {
    origin: found.origin,
    data: {
      offline: false,
      manifestVersion: MANIFEST_VERSION,
      catalog,
      openapi,
      effects: effectsSummary(),
      commands: manifestCommands(catalogIds, openapiIds),
      humanOnly: openapi.operations.filter((op) => op.auth === "human_only").map((op) => op.operationId),
    },
    next: [
      { command: "ein-llc schema ein-route", why: "Inspect a read-only operation before calling it." },
      { command: "ein-llc ein-route --has-ssn-or-itin false --principal-business-in-us true", why: "Credential-free example." },
    ],
  };
}

function schemaCommand(ctx, { args }) {
  if (!args.length) {
    return { data: { manifestVersion: MANIFEST_VERSION, envelope: ENVELOPE_SCHEMA_VERSION, commands: COMMANDS.map(describeCommand) } };
  }
  const entry = matchCommand(args);
  if (!entry || entry.command.split(" ").length !== args.length) {
    throw new CliError({ code: "unknown_command", message: `unknown command: ${args.join(" ").slice(0, 80)}` });
  }
  return { operationId: entry.operationId ?? null, data: describeCommand(entry) };
}

/** Progressive help: groups, then one group, then one command. --json for machines. */
function helpCommand(ctx, { args, global }) {
  if (args.length === 1 && !matchCommand(args) && groupNames().includes(args[0])) {
    const commands = COMMANDS.filter((entry) => entry.group === args[0]).map((entry) => ({ command: entry.command, summary: entry.summary, effect: entry.effect }));
    return global.json ? { data: { group: args[0], commands } } : { text: groupHelpText(args[0]) };
  }
  if (args.length) {
    const entry = matchCommand(args);
    if (!entry || entry.command.split(" ").length !== args.length) {
      throw new CliError({ code: "unknown_command", message: `unknown command: ${args.join(" ").slice(0, 80)}` });
    }
    return global.json ? { data: describeCommand(entry) } : { text: commandHelpText(entry) };
  }
  if (global.json) return { data: helpIndex() };
  return { text: helpIndexText() };
}

function versionCommand() {
  return {
    data: {
      cli: CLI_VERSION,
      manifestVersion: MANIFEST_VERSION,
      envelope: ENVELOPE_SCHEMA_VERSION,
      runtime: runtimeInfo(),
    },
  };
}

async function compareStates(ctx, { entry, flags }) {
  return { origin: ctx.origin, data: await getJson(ctx, entry, flags) };
}

async function einRoute(ctx, { entry, flags }) {
  return {
    origin: ctx.origin,
    data: await getJson(ctx, entry, flags),
    next: [{ command: "ein-llc compliance deadlines --help", why: "Dated obligations after formation." }],
  };
}

async function complianceDeadlines(ctx, { entry, flags }) {
  if (flags.format !== "ics") return { origin: ctx.origin, data: await getJson(ctx, entry, flags) };
  const variant = entry.variants.ics;
  const path = `${variant.http.path}${queryString(entry, flags)}`;
  const result = await withRetries(ctx, () =>
    getBoundedText(ctx.pub.http, {
      origin: ctx.origin,
      path,
      fetch: ctx.fetch,
      timeoutMs: ctx.timeoutMs,
      maxResponseBytes: ctx.maxResponseBytes,
      expectContentType: variant.contentType,
    }),
  );
  return {
    operationId: variant.operationId,
    origin: ctx.origin,
    data: { contentType: result.contentType, bytes: Buffer.byteLength(result.text, "utf8"), ics: result.text },
  };
}

const HANDLERS = {
  help: helpCommand,
  version: versionCommand,
  schema: schemaCommand,
  capabilities,
  "compare-states": compareStates,
  "ein-route": einRoute,
  "compliance deadlines": complianceDeadlines,
  assess,
  prepare,
  "task show": taskShow,
  "task resume": taskResume,
  "task cancel": taskCancel,
  status,
  doctor,
  claim,
  checkout,
};

export function handlerFor(entry) {
  const handler = HANDLERS[entry.command];
  if (!handler || !findCommand(entry.command)) throw new CliError({ code: "unknown_command", message: "no handler" });
  return handler;
}
