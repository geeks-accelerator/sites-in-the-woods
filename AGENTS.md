# Working on sites-in-the-woods

The official CLI and SDK for Sites in the Woods, plus its agent skills and plugin manifests.

## Layout

- `src/client.ts`: the SDK (`SitesInTheWoods`, `ApiError`), one method per API route we support. Answers are the API's own `data`.
- `src/cli.ts`, `src/bin.ts`: the command line.
- `src/mcp-bridge.ts`: stdio to the hosted MCP server at `/mcp`.
- `skills/`: our agent skills, byte for byte what sitesinthewoods.com serves (`npm run check:skills` compares them with the live index's digests). Never edit them here: they're exported from the site's repository.
- `plugin.json`, `mcp.json`: the Agent Plugins manifest. `.claude-plugin/`, `.mcp.json`: the Claude Code plugin and marketplace.
- `test/`: vitest, against a local fake of the API only.

## Rules

- **Node 22 or later**, ESM, TypeScript, **no runtime dependencies**.
- **The key comes only from `SITES_IN_THE_WOODS_API_KEY`**: never an argument, never printed, never in a plugin manifest.
- **Errors in the API's words.** Show its `detail` and `suggestion`; don't invent causes.
- **Only routes the API documents** ([OpenAPI](https://sitesinthewoods.com/openapi.json)). A new command wraps a documented route.
- **Writing:** plain, direct sentences.

## Releasing

1. Change `version` in `package.json` (and in `plugin.json` and `.claude-plugin/plugin.json`); add a CHANGELOG entry.
2. `npm run typecheck`, `npm test`, `npm run check:skills`.
3. Publish a GitHub release tagged `v<version>`: the Release workflow tests it and stages it on npm through trusted publishing.
4. Approve the staged version: `npm stage list sites-in-the-woods`, then `npm stage approve <stage-id>` (2FA).
