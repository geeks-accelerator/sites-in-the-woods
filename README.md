# sites-in-the-woods

The official CLI and SDK for [Sites in the Woods](https://sitesinthewoods.com): website uptime, speed and AI agent readiness monitoring. From a terminal, a deploy script or an agent: what's up, what's open, maintenance windows, and the hosted MCP server over stdio.

Docs for developers and agents: [sitesinthewoods.com/developers](https://sitesinthewoods.com/developers).

## The key

Create a key on your team's [API keys page](https://sitesinthewoods.com/api-keys) and keep it in the environment, never on a command line:

```sh
export SITES_IN_THE_WOODS_API_KEY=sm_…
```

Viewer keys read. Maintenance windows need a Member or Admin key.

## The CLI

```sh
npx sites-in-the-woods status            # every site's status and the open incidents (exits 3 if a site is down)
npx sites-in-the-woods sites             # sites with 1-, 7- and 30-day uptime
npx sites-in-the-woods incidents --recent
npx sites-in-the-woods domains
npx sites-in-the-woods site <slug>       # one site in detail, as JSON
```

Add `--json` for the API's own JSON.

### Check any site, with no key

```sh
npx sites-in-the-woods check example.com            # scored A to F, with each fix and the report's address
npx sites-in-the-woods check example.com --private  # kept only at its own address, off the domain's public page
```

One look at what search engines and agents find: robots.txt, the homepage, the sitemap, the 404 page and the files agents look for. It needs no key, and the key is never sent. In code: `new SitesInTheWoods().check("example.com")`.

### In a deploy

Hold a site's alerts while you deploy (its checks still run), then let them go:

```sh
npx sites-in-the-woods maintenance start my-site --minutes 20 --reason "deploy $GIT_SHA"
./deploy.sh
npx sites-in-the-woods maintenance end my-site
```

Ending is safe to repeat, and a window ends by itself after its minutes.

## The SDK

```ts
import { SitesInTheWoods, ApiError } from "sites-in-the-woods";

const api = new SitesInTheWoods(); // the key from SITES_IN_THE_WOODS_API_KEY
const { sites, openIncidents } = await api.status();
await api.startMaintenance("my-site", { minutes: 20, reason: "deploy" });
```

Errors are thrown as `ApiError`, with the API's problem details: `message`, `suggestion`, `code`, `status`, `retryAfterS`.

## The MCP server

Agent apps that take a remote server can use `https://sitesinthewoods.com/mcp` directly (setups on the [developers page](https://sitesinthewoods.com/developers#mcp)). For apps that only start local servers, `sites-in-the-woods mcp` relays stdio to it, with the key from the environment:

```json
{ "mcpServers": { "sites-in-the-woods": { "command": "npx", "args": ["-y", "sites-in-the-woods", "mcp"] } } }
```

## Skills and plugins

`skills/` holds our five agent skills, the same files [sitesinthewoods.com](https://sitesinthewoods.com/skills) serves. Install them with `npx skills add geeks-accelerator/sites-in-the-woods`. This repository is also an [Agent Plugin](https://agent-plugins.org) (`plugin.json`, `mcp.json`) and a Claude Code plugin marketplace: `/plugin marketplace add geeks-accelerator/sites-in-the-woods`.

## License

MIT. The checks behind the service are open source too: [agent-ready-uptime](https://github.com/geeks-accelerator/agent-ready-uptime).
