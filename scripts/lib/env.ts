import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Minimal .env.local loader for tsx scripts (Next loads it for the app). */
export function loadEnv(file = ".env.local") {
  const path = join(process.cwd(), file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
