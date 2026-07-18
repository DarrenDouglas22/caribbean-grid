import { withClient, cors } from './_db.mjs';
import { recordEvent } from './_handlers.mjs';

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const { deviceId, event, puzzleDate } = await readBody(req);
    if (!deviceId || !event || !puzzleDate) return res.status(400).json({ error: 'bad_request' });
    await withClient((c) => recordEvent(c, { deviceId, event, puzzleDate }));
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
}
