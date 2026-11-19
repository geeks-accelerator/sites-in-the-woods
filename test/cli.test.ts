import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError, SitesInTheWoods } from "../src/client.js";
import { main, parseArgs } from "../src/cli.js";
import { messagesOf, runBridge } from "../src/mcp-bridge.js";

const KEY = "sm_test_key";
const seen: Array<{ method: string; url: string; auth: string | undefined; body: string }> = [];
let server: Server;
let base = "";

/** A fake of the API: the routes the CLI calls, problem details for errors, and /mcp. */
function handle(req: IncomingMessage, res: ServerResponse, body: string) {
  seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, body });
  const json = (status: number, v: unknown, type = "application/json") => (res.writeHead(status, { "content-type": type }), res.end(JSON.stringify(v)));
  if (req.url === "/mcp") {
    const msg = JSON.parse(body) as { id?: number; method: string };
    if (msg.id === undefined) return res.writeHead(202).end();
    if (msg.method === "tools/list") {
      res.writeHead(200, { "content-type": "text/event-stream", "mcp-session-id": "s1" });
      return res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "status" }] } })}\n\n`);
    }
    return json(200, { jsonrpc: "2.0", id: msg.id, result: { session: req.headers["mcp-session-id"] ?? null } });
  }
  if (req.headers.authorization !== `Bearer ${KEY}`)
    return json(401, { type: "/api/docs#error-unauthorized", title: "Unauthorized", status: 401, detail: "Sign in, or send an API key.", error: "unauthorized", message: "Sign in, or send an API key.", suggestion: "Send Authorization: Bearer sm_…" }, "application/problem+json");
  if (req.url === "/api/status")
    return json(200, { data: { sites: [{ slug: "a", name: "a.test", status: "up", paused: false }, { slug: "b", name: "b.test", status: "down", paused: false }], openIncidents: [{ kind: "site_down", severity: "down", site: "b", startedAt: "2026-11-19T00:00:00Z", cause: "timeout", dismissed: false }] } });
  if (req.url === "/api/sites") return json(200, { data: [{ slug: "a", name: "a.test", status: "up", paused: false, uptime: { d1: { ok: 999, total: 1000 }, d7: null, d30: null }, openIncidents: 0 }] });
  if (req.url === "/api/incidents?state=recent") return json(200, { data: [] });
  if (req.url === "/api/sites/a/maintenance/start") return json(200, { data: { id: "w1", startsAt: "2026-11-19T00:00:00Z", endsAt: "2026-11-19T00:30:00Z", reason: "deploy" } });
  if (req.url === "/api/sites/a/maintenance/end") return json(200, { data: { ended: 1 } });
  if (req.url === "/api/sites/limited/maintenance/end") return (res.writeHead(429, { "content-type": "application/problem+json", "retry-after": "7" }), res.end(JSON.stringify({ title: "Rate limited", status: 429, detail: "Too many writes for this key in 10 seconds.", error: "rate_limited", message: "Too many writes for this key in 10 seconds." })));
  return json(404, { title: "Not found", status: 404, detail: "No such route.", error: "not_found", message: "No such route." }, "application/problem+json");
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => handle(req, res, body));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  base = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const run = async (argv: string[], key = KEY) => {
  let out = "";
  let err = "";
  const code = await main(argv, { out: (s) => (out += s), err: (s) => (err += s) }, new SitesInTheWoods({ key, baseUrl: base }));
  return { code, out, err };
};

describe("the CLI", () => {
  it("says what's down, and exits 3 when a site is", async () => {
    const r = await run(["status"]);
    expect(r.out).toContain("1 down: b.test · 1 open incident");
    expect(r.out).toContain("down  b  site_down: timeout");
    expect(r.code).toBe(3);
  });

  it("lists sites with uptime rounded down, and passes JSON through", async () => {
    expect((await run(["sites"])).out).toMatch(/a\s+up\s+99\.9%/);
    expect(JSON.parse((await run(["sites", "--json"])).out)[0].slug).toBe("a");
    expect((await run(["incidents", "--recent"])).out).toBe("No recent incidents.\n");
  });

  it("starts and ends maintenance for deploy scripts, with the key from the environment only", async () => {
    seen.length = 0;
    const start = await run(["maintenance", "start", "a", "--minutes", "30", "--reason", "deploy"]);
    expect(start.code).toBe(0);
    expect(start.out).toContain("Alerts held for a until 2026-11-19T00:30:00Z");
    expect(seen[0]).toMatchObject({ method: "POST", url: "/api/sites/a/maintenance/start", auth: `Bearer ${KEY}` });
    expect(JSON.parse(seen[0]!.body)).toEqual({ minutes: 30, reason: "deploy" });
    expect((await run(["maintenance", "end", "a"])).out).toContain("Ended 1 window on a");
    // There's no --key: an argument would land in shell history.
    expect(parseArgs(["status", "--key", "sm_x"]).flags.key).toBe(true);
  });

  it("explains errors in the API's own words, with when to retry", async () => {
    const limited = await run(["maintenance", "end", "limited"]);
    expect(limited.code).toBe(1);
    expect(limited.err).toBe("Too many writes for this key in 10 seconds.\nRetry in 7 seconds.\n");
    const bad = await run(["status"], "sm_wrong");
    expect(bad.code).toBe(2);
    expect(bad.err).toContain("Sign in, or send an API key.\nSend Authorization");
    const none = await run(["status"], "");
    expect(none.code).toBe(2);
    expect(none.err).toContain("SITES_IN_THE_WOODS_API_KEY");
  });

  it("refuses a bad --minutes and unknown commands", async () => {
    expect((await run(["maintenance", "start", "a", "--minutes", "soon"])).code).toBe(1);
    expect((await run(["nope"])).code).toBe(1);
  });
});

describe("the SDK", () => {
  it("throws ApiError with the problem details", async () => {
    const e = await new SitesInTheWoods({ key: "sm_wrong", baseUrl: base }).status().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 401, code: "unauthorized", message: "Sign in, or send an API key.", suggestion: "Send Authorization: Bearer sm_…" });
  });
});

describe("the MCP bridge", () => {
  it("reads JSON and event-stream answers alike", () => {
    expect(messagesOf("application/json", '{"id":1}')).toEqual([{ id: 1 }]);
    expect(messagesOf("text/event-stream", 'event: message\ndata: {"id":2}\n\n')).toEqual([{ id: 2 }]);
    expect(messagesOf("application/json", "")).toEqual([]);
  });

  it("relays stdin to /mcp in order, keeps the session, answers nothing to notifications", async () => {
    seen.length = 0;
    const input = new PassThrough();
    const output = new PassThrough();
    let written = "";
    output.on("data", (c) => (written += c));
    const done = runBridge({ key: KEY, baseUrl: base, input, output, error: new PassThrough() });
    input.write('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
    input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    input.write('{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
    input.write("not json\n");
    input.end();
    await done;
    const lines = written.trim().split("\n").map((l) => JSON.parse(l) as { id: number | null; result?: { session?: string }; error?: unknown });
    expect(lines.map((l) => l.id)).toEqual([1, 2, null]);
    expect(lines[1]!.result).toEqual({ session: "s1" });
    expect(lines[2]!.error).toBeTruthy();
    expect(seen.every((s) => s.auth === `Bearer ${KEY}`)).toBe(true);
  });
});
