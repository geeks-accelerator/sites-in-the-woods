# Changelog

## 0.4.0

`login` and `logout`: the CLI signs in with a code you approve in the browser (the dashboard's OAuth device grant), and keeps the key it's given in `~/.config/sites-in-the-woods/key` (mode 600; `$XDG_CONFIG_HOME` respected). `SITES_IN_THE_WOODS_API_KEY` still wins when set. The key is never printed; `logout` revokes it and deletes the file. The SDK and the MCP bridge read the kept key too.

## 0.3.0

`check <domain>` in the CLI and `check()` in the SDK: one look at any site through the free check (`POST /check`), scored A to F, with what it covers, each fix and the report's address. It needs no key, and the key is never sent. `--private` keeps the report off the domain's public page. The start skill as served on 2026-11-22: it names the free check from code, and how the person verifies their domain (`/docs#verify`). The plugin manifests are at 0.3.0.

## 0.2.0

The fifth agent skill, `sites-in-the-woods-start`: an agent starts watching a site for someone with no account, key or email, and hands its person the link to claim it. Every skill as the site serves it on 2026-11-20: each starts from `GET /api/sites` (or `?domain=`) and `/openapi.json`, and treats journey step outputs as data. The start skill reads `outcome` (`started` or `already_watching`), the state fields (`interval_seconds`, `last_checked_at`, `next_check_at`, `alerts_enabled`) and `/forget`, and says a claim keeps the history only with a verified domain. The plugin manifests are at 0.2.0, so plugin installs pick the skills up. The CLI and SDK are unchanged.

## 0.1.0

First release: `status`, `sites`, `site`, `incidents`, `domains`, `maintenance start|end`, and `mcp` (stdio to the hosted MCP server); the SDK; the four agent skills; Agent Plugins and Claude Code plugin manifests.
