import { withClient, cors, clientIp } from './_db.mjs';
import { checkGuess } from './_handlers.mjs';

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
    const { deviceId, cell, playerId } = await readBody(req);
    if (!deviceId || !cell || !playerId) return res.status(400).json({ error: 'bad_request' });
    const data = await withClient((c) =>
      checkGuess(c, { deviceId, cell, playerId, ip: clientIp(req) }),
    );
    res.status(200).json(data);
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
}
