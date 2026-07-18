// Tiny .env loader so scripts pick up SUPABASE_URL / SUPABASE_SERVICE_KEY
// without adding a dependency. Reads .env at repo root if present; real
// environment variables always win.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '../../.env');
  let text;
  try {
    text = readFileSync(envPath, 'utf8');
  } catch {
    return; // no .env — rely on the real environment
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
