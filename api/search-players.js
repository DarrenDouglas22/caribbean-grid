import { withClient, cors } from './_db.mjs';
import { searchPlayers } from './_handlers.mjs';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const q = (req.query?.q ?? '').toString();
  try {
    const rows = await withClient((c) => searchPlayers(c, q));
    res.status(200).json(rows);
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
}
