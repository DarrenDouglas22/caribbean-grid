// Shared node-postgres pool for the serverless functions, connected to Neon via
// DATABASE_URL. Pool is module-scoped so warm invocations reuse connections.
import pg from 'pg';

let pool;

export function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Neon requires SSL
      max: 3,
    });
  }
  return pool;
}

// CORS: the static frontend (GitHub Pages or Vercel static) may be a different
// origin than the /api functions. Allow the configured site origin, or * as a
// permissive default (the endpoints expose no secrets and no answer corpus).
export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOW_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return fwd ? String(fwd).split(',')[0].trim() : null;
}

// Run a handler with a pooled client, releasing it afterward.
export async function withClient(fn) {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
