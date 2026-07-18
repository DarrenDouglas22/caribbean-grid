import { withClient, cors } from './_db.mjs';
import { getPuzzle } from './_handlers.mjs';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const data = await withClient((c) => getPuzzle(c));
    res.status(200).json(data);
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
}
