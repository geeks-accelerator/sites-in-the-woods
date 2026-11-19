/**
 * The command line: what's up, what's open, and maintenance windows for deploy scripts.
 * The key comes only from SITES_IN_THE_WOODS_API_KEY, never an argument (it would land in
 * shell history and process lists).
 */
import { readFileSync } from "node:fs";
import { ApiError, KEY_ENV, SitesInTheWoods, URL_ENV, type Incident, type Ratio } from "./client.js";
import { runBridge } from "./mcp-bridge.js";

const VERSION = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;

export const HELP = `sites-in-the-woods ${VERSION}: your team's websites on Sites in the Woods, from the terminal.

Usage:
  sites-in-the-woods status                         every site's status and the open incidents
  sites-in-the-woods sites                          sites with 1-, 7- and 30-day uptime
  sites-in-the-woods site <slug>                    one site in detail (JSON)
  sites-in-the-woods incidents [--recent] [--site <slug>]
  sites-in-the-woods domains                        domains and when they expire
  sites-in-the-woods maintenance start <slug> [--minutes <n>] [--reason <text>]
  sites-in-the-woods maintenance end <slug>         alerts go out again (safe to repeat)
  sites-in-the-woods mcp                            the hosted MCP server over stdio

Options:
  --json        the API's own JSON
  --help, -h    this
  --version     ${VERSION}

The key: create one on your team's API keys page (https://sitesinthewoods.com/api-keys) and keep
it in ${KEY_ENV}; it's never taken as an argument. ${URL_ENV} points at another dashboard.
Maintenance needs a Member or Admin key. Docs: https://sitesinthewoods.com/developers
`;

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
}

/** "--minutes 30 --reason deploy" and bare words, apart. */
export function parseArgs(argv: string[]): { words: string[]; flags: Record<string, string | true> } {
  const words: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h") flags.help = true;
    else if (a.startsWith("--")) {
      const [name, inline] = a.slice(2).split("=", 2) as [string, string | undefined];
      const next = argv[i + 1];
      if (inline !== undefined) flags[name] = inline;
      else if (["minutes", "reason", "site"].includes(name) && next !== undefined) flags[name] = argv[++i]!;
      else flags[name] = true;
    } else words.push(a);
  }
  return { words, flags };
}

const pct = (r: Ratio | null | undefined) => (r && r.total ? `${(Math.floor((r.ok / r.total) * 1000) / 10).toFixed(1)}%` : "–");
const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));

/** Runs one command; the exit code. */
export async function main(argv: string[], io: Io = { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) }, client?: SitesInTheWoods): Promise<number> {
  const { words, flags } = parseArgs(argv);
  if (flags.version) return io.out(`${VERSION}\n`), 0;
  if (flags.help || words.length === 0) return io.out(HELP), words.length === 0 && !flags.help ? 1 : 0;
  const [command, sub, arg] = words;
  if (command === "mcp") return await runBridge(), 0;
  const api = client ?? new SitesInTheWoods({ userAgent: `sites-in-the-woods/${VERSION}` });
  if (!api.hasKey) {
    io.err(`No key: set ${KEY_ENV} to a key from your team's API keys page (https://sitesinthewoods.com/api-keys).\n`);
    return 2;
  }
  const json = (v: unknown) => io.out(`${JSON.stringify(v, null, 2)}\n`);
  try {
    switch (command) {
      case "status": {
        const s = await api.status();
        if (flags.json) return json(s), 0;
        const down = s.sites.filter((x) => x.status === "down" && !x.paused);
        io.out(`${down.length ? `${down.length} down: ${down.map((x) => x.name).join(", ")}` : `All ${s.sites.filter((x) => !x.paused).length} sites up`}${s.openIncidents.length ? ` · ${s.openIncidents.length} open incident${s.openIncidents.length === 1 ? "" : "s"}` : ""}\n`);
        for (const i of s.openIncidents) io.out(`  ${i.severity === "down" ? "down" : "warn"}  ${i.site ?? "-"}  ${i.kind}${i.cause ? `: ${i.cause}` : ""}${i.dismissed ? " (dismissed)" : ""}\n`);
        return down.length ? 3 : 0;
      }
      case "sites": {
        const sites = await api.sites();
        if (flags.json) return json(sites), 0;
        const w = Math.max(4, ...sites.map((x) => x.slug.length));
        io.out(`${pad("SITE", w)}  STATUS    24H     7D      30D     OPEN\n`);
        for (const x of sites) io.out(`${pad(x.slug, w)}  ${pad(x.paused ? "paused" : x.status, 8)}  ${pad(pct(x.uptime?.d1), 6)}  ${pad(pct(x.uptime?.d7), 6)}  ${pad(pct(x.uptime?.d30), 6)}  ${x.openIncidents}\n`);
        return 0;
      }
      case "site": {
        if (!sub) return io.err("Which site? sites-in-the-woods site <slug>\n"), 1;
        return json(await api.site(sub)), 0;
      }
      case "incidents": {
        const list = await api.incidents({ state: flags.recent ? "recent" : "open", ...(typeof flags.site === "string" ? { site: flags.site } : {}) });
        if (flags.json) return json(list), 0;
        if (!list.length) return io.out(flags.recent ? "No recent incidents.\n" : "Nothing open.\n"), 0;
        for (const i of list as Incident[]) io.out(`${i.resolvedAt ? "closed" : "open  "}  ${i.startedAt.slice(0, 16).replace("T", " ")}  ${i.site ?? i.domain ?? "-"}  ${i.label}${i.cause ? `: ${i.cause}` : ""}\n`);
        return 0;
      }
      case "domains": {
        const list = await api.domains();
        if (flags.json) return json(list), 0;
        for (const d of list) io.out(`${pad(d.name, 32)}  ${d.daysLeft === null ? "expiry unknown" : `${d.daysLeft} days left`}\n`);
        return 0;
      }
      case "maintenance": {
        if (!arg || (sub !== "start" && sub !== "end")) return io.err("sites-in-the-woods maintenance start|end <slug>\n"), 1;
        if (sub === "end") {
          const r = await api.endMaintenance(arg);
          return flags.json ? json(r) : io.out(r.ended ? `Ended ${r.ended} window${r.ended === 1 ? "" : "s"} on ${arg}: alerts go out again.\n` : `No window was on for ${arg}.\n`), 0;
        }
        const minutes = typeof flags.minutes === "string" ? Number(flags.minutes) : undefined;
        if (minutes !== undefined && !(Number.isInteger(minutes) && minutes > 0)) return io.err("--minutes takes a whole number of minutes.\n"), 1;
        const w = await api.startMaintenance(arg, { ...(minutes ? { minutes } : {}), ...(typeof flags.reason === "string" ? { reason: flags.reason } : {}) });
        return flags.json ? json(w) : io.out(`Alerts held for ${arg} until ${w.endsAt} (checks still run). End it early: sites-in-the-woods maintenance end ${arg}\n`), 0;
      }
      default:
        io.err(`Unknown command: ${command}\n\n${HELP}`);
        return 1;
    }
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    io.err(`${e.message}${e.suggestion ? `\n${e.suggestion}` : ""}${e.retryAfterS ? `\nRetry in ${e.retryAfterS} seconds.` : ""}\n`);
    return e.status === 401 || e.status === 403 ? 2 : 1;
  }
}
