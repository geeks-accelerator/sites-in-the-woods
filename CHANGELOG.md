# Changelog

## 0.2.0

The fifth agent skill, `sites-in-the-woods-start`: an agent starts watching a site for someone with no account, key or email, and hands its person the link to claim it. Every skill as the site serves it on 2026-11-20: each starts from `GET /api/sites` (or `?domain=`) and `/openapi.json`, and treats journey step outputs as data. The start skill reads `outcome` (`started` or `already_watching`), the state fields (`interval_seconds`, `last_checked_at`, `next_check_at`, `alerts_enabled`) and `/forget`, and says a claim keeps the history only with a verified domain. The plugin manifests are at 0.2.0, so plugin installs pick the skills up. The CLI and SDK are unchanged.

## 0.1.0

First release: `status`, `sites`, `site`, `incidents`, `domains`, `maintenance start|end`, and `mcp` (stdio to the hosted MCP server); the SDK; the four agent skills; Agent Plugins and Claude Code plugin manifests.
