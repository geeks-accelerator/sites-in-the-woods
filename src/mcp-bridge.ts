/**
 * The hosted MCP server, over stdio: for agent apps that only start local servers. Each
 * JSON-RPC message read from stdin (one per line) is posted to <base>/mcp with the key from
 * the environment, and each answer is written to stdout, one per line. Notifications get no
 * answer. Nothing is logged but our own one-line errors, to stderr.
 */
import { createInterface } from "node:readline";
import { DEFAULT_BASE_URL, KEY_ENV, URL_ENV } from "./client.js";

export interface BridgeOptions {
  key?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  error?: NodeJS.WritableStream;
}

/** The JSON messages in an answer: a JSON body, or the `data:` lines of an event stream. */
export function messagesOf(contentType: string, body: string): unknown[] {
  if (!body.trim()) return [];
  if (contentType.includes("text/event-stream")) {
    return body
      .split(/\r?\n\r?\n/)
      .map((event) =>
        event
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n"),
      )
      .filter((d) => d.trim())
      .map((d) => JSON.parse(d) as unknown);
  }
  const parsed = JSON.parse(body) as unknown;
  return Array.isArray(parsed) ? parsed : [parsed];
}

export async function runBridge(o: BridgeOptions = {}): Promise<void> {
  const key = o.key ?? process.env[KEY_ENV];
  const url = `${(o.baseUrl ?? process.env[URL_ENV] ?? DEFAULT_BASE_URL).replace(/\/+$/, "")}/mcp`;
  const fetcher = o.fetch ?? fetch;
  const out = o.output ?? process.stdout;
  const err = o.error ?? process.stderr;
  let session: string | null = null;
  const lines = createInterface({ input: o.input ?? process.stdin, crlfDelay: Infinity });
  // One message at a time, in order: clients expect answers in the order they asked.
  for await (const line of lines) {
    if (!line.trim()) continue;
    let id: unknown = null;
    try {
      id = (JSON.parse(line) as { id?: unknown }).id ?? null;
    } catch {
      out.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: one JSON-RPC message per line." } })}\n`);
      continue;
    }
    try {
      const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", "user-agent": "sites-in-the-woods-mcp" };
      if (key) headers.authorization = `Bearer ${key}`;
      if (session) headers["mcp-session-id"] = session;
      const res = await fetcher(url, { method: "POST", headers, body: line });
      session = res.headers.get("mcp-session-id") ?? session;
      for (const m of messagesOf(res.headers.get("content-type") ?? "", await res.text())) out.write(`${JSON.stringify(m)}\n`);
    } catch (e) {
      err.write(`sites-in-the-woods mcp: couldn't reach ${url} (${(e as Error).message})\n`);
      if (id !== null) out.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message: `Couldn't reach ${url}. Try again shortly.` } })}\n`);
    }
  }
}
