// The skills here must be byte for byte what sitesinthewoods.com serves: their sha256 equals the
// digest in its index (https://sitesinthewoods.com/.well-known/agent-skills/index.json).
// Run before a release; to update them, run `npm run skills:export -- <this repo>/skills` in the site's repo.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const index = await (await fetch("https://sitesinthewoods.com/.well-known/agent-skills/index.json")).json();
let stale = 0;
for (const s of index.skills) {
  let local;
  try {
    local = readFileSync(new URL(`../skills/${s.name}/SKILL.md`, import.meta.url));
  } catch {
    console.log(`missing  ${s.name}`);
    stale++;
    continue;
  }
  const same = `sha256:${createHash("sha256").update(local).digest("hex")}` === s.digest;
  if (!same) stale++;
  console.log(`${same ? "same    " : "differs "} ${s.name}`);
}
process.exitCode = stale ? 1 : 0;
