/**
 * The Sites in the Woods API, typed: a team's sites, incidents and domains, and the writes a
 * deploy needs (maintenance windows). One API key per team, from the dashboard's API keys page,
 * read from SITES_IN_THE_WOODS_API_KEY by default and never logged.
 *
 * Every answer is the API's own `data`. An error is thrown as `ApiError`, carrying the API's
 * RFC 9457 problem details (`title`, `detail`, `suggestion`, `next_steps`).
 */

export const DEFAULT_BASE_URL = "https://sitesinthewoods.com";
/** Where the key is read from: never pass it on a command line. */
export const KEY_ENV = "SITES_IN_THE_WOODS_API_KEY";
/** Another address, for a self-hosted or test dashboard. */
export const URL_ENV = "SITES_IN_THE_WOODS_URL";

export interface ClientOptions {
  /** The team's API key (sm_…). Defaults to process.env.SITES_IN_THE_WOODS_API_KEY. */
  key?: string;
  /** Defaults to process.env.SITES_IN_THE_WOODS_URL, then https://sitesinthewoods.com. */
  baseUrl?: string;
  /** For tests and other runtimes. */
  fetch?: typeof fetch;
  /** Sent as User-Agent. */
  userAgent?: string;
}

export interface Ratio {
  ok: number;
  total: number;
}

export interface Status {
  sites: Array<{ slug: string; name: string; status: string; paused: boolean }>;
  openIncidents: Array<{ kind: string; severity: "down" | "warning"; site: string | null; startedAt: string; cause: string | null; dismissed: boolean }>;
}

export interface Site {
  slug: string;
  name: string;
  project: string;
  url: string;
  status: string;
  paused: boolean;
  public: boolean;
  checkFrom: "us-west" | "us-east" | "split";
  uptime: { d1: Ratio | null; d7: Ratio | null; d30: Ratio | null } | null;
  openIncidents: number;
  dismissed: number;
}

export interface Incident {
  id: string;
  kind: string;
  label: string;
  severity: "down" | "warning";
  site: string | null;
  url: string | null;
  domain: string | null;
  startedAt: string;
  resolvedAt: string | null;
  cause: string | null;
  dismissed: { by: string; at: string } | null;
  [more: string]: unknown;
}

export interface Domain {
  name: string;
  expiresAt: string | null;
  daysLeft: number | null;
  registrar: string | null;
  sites: string[];
  [more: string]: unknown;
}

export interface MaintenanceWindow {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

/** One look at a site: the free check's answer (POST /check), as https://sitesinthewoods.com/start/openapi.json describes it. */
export interface CheckReport {
  domain: string;
  host: string;
  checked_at: string;
  report: string;
  data: string;
  markdown: string;
  fresh: boolean;
  private: boolean;
  unreachable: string | null;
  opted_out: boolean;
  score: { score: number; grade: "A" | "B" | "C" | "D" | "F"; word: string; verdict: string; covers: string; cap: string | null; with_every_fix: number | null; [more: string]: unknown } | null;
  findings: Array<{ id: string; label: string; state: "ok" | "warn" | "missing" | "na" | "unknown"; text: string; fix?: string; gain?: number; [more: string]: unknown }>;
  message: string;
  [more: string]: unknown;
}

/** The API said no: its problem details (RFC 9457), and what to do next. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly suggestion: string | null;
  readonly nextSteps: Array<{ method: string; path: string; why: string }>;
  readonly retryAfterS: number | null;

  constructor(status: number, body: Record<string, unknown>, retryAfter: string | null) {
    const detail = typeof body.detail === "string" ? body.detail : typeof body.message === "string" ? body.message : `The API answered ${status}.`;
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.code = typeof body.error === "string" ? body.error : String(status);
    this.suggestion = typeof body.suggestion === "string" ? body.suggestion : null;
    this.nextSteps = Array.isArray(body.next_steps) ? (body.next_steps as ApiError["nextSteps"]) : [];
    this.retryAfterS = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null;
  }
}

export class SitesInTheWoods {
  readonly baseUrl: string;
  private readonly key: string | undefined;
  private readonly fetcher: typeof fetch;
  private readonly userAgent: string;

  constructor(o: ClientOptions = {}) {
    this.key = o.key ?? process.env[KEY_ENV] ?? undefined;
    this.baseUrl = (o.baseUrl ?? process.env[URL_ENV] ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetcher = o.fetch ?? fetch;
    this.userAgent = o.userAgent ?? "sites-in-the-woods";
  }

  /** Whether a key is set (every read and write needs one). */
  get hasKey(): boolean {
    return !!this.key;
  }

  /** Every site's status and the open incidents, in one call. */
  status(): Promise<Status> {
    return this.get("/api/status");
  }

  /** The team's sites, with 1-, 7- and 30-day uptime. */
  sites(): Promise<Site[]> {
    return this.get("/api/sites");
  }

  /** One site, by its slug. */
  site(slug: string): Promise<Record<string, unknown>> {
    return this.get(`/api/sites/${encodeURIComponent(slug)}`);
  }

  /** Incidents open now (the default), or `recent`: newest first, open or closed. */
  incidents(o: { state?: "open" | "recent"; site?: string; limit?: number } = {}): Promise<Incident[]> {
    const q = new URLSearchParams();
    if (o.state) q.set("state", o.state);
    if (o.site) q.set("site", o.site);
    if (o.limit) q.set("limit", String(o.limit));
    return this.get(`/api/incidents${q.size ? `?${q}` : ""}`);
  }

  /** The team's domains and when they expire. */
  domains(): Promise<Domain[]> {
    return this.get("/api/domains");
  }

  /**
   * One look at any site, scored A to F: what search engines and agents find. Needs no key, and the key is never
   * sent. `private` keeps the report off the domain's public page. One look per domain every 10 minutes: a
   * newer report is answered instead (`fresh`).
   */
  check(domain: string, o: { private?: boolean } = {}): Promise<CheckReport> {
    return this.request("POST", "/check", { domain, ...(o.private ? { private: true } : {}) }, { keyless: true });
  }

  /** Hold a site's alerts for a deploy (checks still run). Needs a Member or Admin key. */
  startMaintenance(slug: string, o: { minutes?: number; reason?: string } = {}): Promise<MaintenanceWindow> {
    return this.post(`/api/sites/${encodeURIComponent(slug)}/maintenance/start`, o);
  }

  /** Alerts go out again from now. Safe to repeat: ending with none open answers `ended: 0`. */
  endMaintenance(slug: string): Promise<{ ended: number }> {
    return this.post(`/api/sites/${encodeURIComponent(slug)}/maintenance/end`, {});
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  /** `keyless`: a route outside the team API (the free check), answered as a whole, not in `data`, and never sent the key. */
  private async request<T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>, o: { keyless?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json", "user-agent": this.userAgent };
    if (this.key && !o.keyless) headers.authorization = `Bearer ${this.key}`;
    if (body) headers["content-type"] = "application/json";
    const res = await this.fetcher(`${this.baseUrl}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new ApiError(res.status, { detail: `The API answered ${res.status} without JSON.` }, null);
    }
    if (!res.ok) throw new ApiError(res.status, json, res.headers.get("retry-after"));
    return (o.keyless ? json : json.data) as T;
  }
}
