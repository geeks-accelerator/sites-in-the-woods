/**
 * Where `sites-in-the-woods login` keeps the key it's given: a file only you can read
 * ($XDG_CONFIG_HOME/sites-in-the-woods/key, else ~/.config/sites-in-the-woods/key; mode 600 in a
 * directory of mode 700), as Stripe's and Vercel's CLIs do. SITES_IN_THE_WOODS_API_KEY wins when
 * it's set. The key is never printed or logged; `logout` revokes it and deletes the file.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function keyFile(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "sites-in-the-woods", "key");
}

/** The stored key, or undefined. */
export function storedKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  try {
    const k = readFileSync(keyFile(env), "utf8").trim();
    return /^sm_[A-Za-z0-9_-]{43}$/.test(k) ? k : undefined;
  } catch {
    return undefined;
  }
}

export function storeKey(key: string, env: NodeJS.ProcessEnv = process.env): string {
  const file = keyFile(env);
  const dir = join(file, "..");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(file, `${key}\n`, { mode: 0o600 });
  // An existing file keeps its mode on write: set it.
  chmodSync(file, 0o600);
  return file;
}

export function forgetKey(env: NodeJS.ProcessEnv = process.env): boolean {
  const file = keyFile(env);
  if (!existsSync(file)) return false;
  rmSync(file);
  return true;
}
