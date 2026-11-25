/** SPDX-License-Identifier: MIT
 * Strict argv parser in the style of tools/activation-client/src/cli.mjs
 * (unknown flags refused, option values required), driven by the manifest.
 * No prompts, no environment-dependent flags, no payloads in argv.
 */
import { CliError } from "./errors.mjs";
import { COMMANDS, GLOBAL_FLAGS, matchCommand } from "./manifest.mjs";

const ALL_FLAGS = new Map();
for (const flag of [...GLOBAL_FLAGS, ...COMMANDS.flatMap((entry) => entry.flags || [])]) {
  if (!ALL_FLAGS.has(flag.name)) ALL_FLAGS.set(flag.name, flag);
  if (flag.alias) ALL_FLAGS.set(flag.alias, flag);
}

function tokenize(argv) {
  const positionals = [];
  const flags = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i]);
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1).map(String));
      break;
    }
    if (arg === "-h") {
      flags.push({ name: "help", value: true });
      continue;
    }
    if (!arg.startsWith("--")) {
      if (arg.startsWith("-") && arg.length > 1) {
        throw new CliError({ code: "unknown_flag", message: `unknown flag ${arg.slice(0, 64)}` });
      }
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const name = arg.slice(2, eq === -1 ? undefined : eq);
    const def = ALL_FLAGS.get(name);
    if (!def) throw new CliError({ code: "unknown_flag", message: `unknown flag --${name.slice(0, 64)}` });
    if (def.type === "switch") {
      if (eq !== -1) throw new CliError({ code: "invalid_input", field: def.name, message: `--${def.name} takes no value` });
      flags.push({ name: def.name, value: true });
      continue;
    }
    let value;
    if (eq !== -1) value = arg.slice(eq + 1);
    else {
      value = argv[i + 1];
      if (value === undefined || String(value).startsWith("--")) {
        throw new CliError({ code: "invalid_input", field: def.name, message: `--${def.name} requires a value` });
      }
      i += 1;
    }
    flags.push({ name: def.name, value: String(value) });
  }
  return { positionals, flags };
}

function invalid(flag, message) {
  return new CliError({ code: "invalid_input", field: flag.name, message: `--${flag.name} ${message}` });
}

export function coerceFlag(flag, raw) {
  if (flag.type === "switch") return true;
  const value = String(raw);
  if (/[\u0000-\u001f\u007f]/.test(value)) throw invalid(flag, "must not contain control characters");
  switch (flag.type) {
    case "boolean":
      if (value === "true") return true;
      if (value === "false") return false;
      throw invalid(flag, "must be true or false");
    case "integer": {
      if (!/^\d{1,9}$/.test(value)) throw invalid(flag, "must be a non-negative integer");
      const n = Number(value);
      if (n < flag.min || n > flag.max) throw invalid(flag, `must be between ${flag.min} and ${flag.max}`);
      return n;
    }
    case "enum":
      if (!flag.enum.includes(value)) throw invalid(flag, `must be one of ${flag.enum.join(", ")}`);
      return value;
    case "date": {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      const date = match ? new Date(`${value}T00:00:00Z`) : null;
      if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw invalid(flag, "must be a calendar date YYYY-MM-DD");
      }
      return value;
    }
    default:
      if (flag.minLength != null && value.trim().length < flag.minLength) throw invalid(flag, "must not be empty");
      if (flag.maxLength != null && value.length > flag.maxLength) throw invalid(flag, `must be at most ${flag.maxLength} characters`);
      if (flag.pattern && !new RegExp(flag.pattern).test(value)) throw invalid(flag, "does not match the required format");
      return value;
  }
}

/**
 * Returns { entry, args, global, flags } or throws CliError.
 * With no command, or `--help` alone, resolves to the help entry.
 */
export function parseArgv(argv) {
  const { positionals, flags: tokens } = tokenize(argv);
  const wantsHelp = tokens.some((token) => token.name === "help");
  let entry = positionals.length ? matchCommand(positionals) : matchCommand(["help"]);
  if (!entry) {
    throw new CliError({ code: "unknown_command", message: `unknown command: ${positionals.join(" ").slice(0, 80)}` });
  }
  let args = positionals.slice(entry.command.split(" ").length);
  if (wantsHelp && entry.command !== "help") {
    args = entry.command.split(" ");
    entry = matchCommand(["help"]);
  }
  const maxArgs = entry.args ? (entry.command === "help" || entry.command === "schema" ? 2 : entry.args.length) : 0;
  if (args.length > maxArgs) {
    throw new CliError({ code: "invalid_input", message: "unexpected positional argument; payloads go on stdin or --input" });
  }

  const allowed = new Map();
  for (const flag of GLOBAL_FLAGS) allowed.set(flag.name, flag);
  for (const flag of entry.flags || []) allowed.set(flag.name, flag);

  const global = {};
  const flags = {};
  const seen = new Set();
  for (const token of tokens) {
    if (token.name === "help") continue;
    const flag = allowed.get(token.name);
    if (!flag) throw new CliError({ code: "unknown_flag", message: `--${token.name} is not accepted by ${entry.command}` });
    if (seen.has(token.name)) throw new CliError({ code: "invalid_input", field: token.name, message: `--${token.name} given more than once` });
    seen.add(token.name);
    const value = coerceFlag(flag, token.value);
    if (GLOBAL_FLAGS.includes(flag)) global[flag.name] = value;
    else flags[flag.name] = value;
  }
  for (const flag of entry.flags || []) {
    if (flags[flag.name] === undefined && flag.default !== undefined) flags[flag.name] = flag.default;
    if (flag.required && flags[flag.name] === undefined) {
      throw new CliError({ code: "invalid_input", field: flag.name, message: `--${flag.name} is required` });
    }
  }
  return { entry, args, global, flags };
}
