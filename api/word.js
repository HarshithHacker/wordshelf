// POST /api/word  { q, books: [existing book names] }  →  a word card filed into a book
import { explainWord } from '../lib/word-crew.js';
import { checkLimit } from '../lib/limits.js';
import { str } from '../lib/gemini.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Use POST' });
  const b = req.body || {};
  const query = str(b.q, 60).replace(/[^\p{L}\p{N}\s'’-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (query.length < 2) return res.status(400).json({ ok: false, message: 'Type a word or phrase to look up.' });
  const blocked = checkLimit(req, { perHour: 60, perDay: 400 });
  if (blocked) return res.status(429).json({ ok: false, message: blocked });
  const books = (Array.isArray(b.books) ? b.books : []).map(x => str(x, 40)).filter(Boolean).slice(0, 40);
  try {
    res.status(200).json(await explainWord({ query, books }));
  } catch (e) {
    console.error(e);
    const setup = /not set in Vercel/.test(e.message);
    res.status(500).json({ ok: false, message: setup ? 'Setup needed: ' + e.message + '.' : 'Couldn\'t look that up: ' + String(e.message).slice(0, 140) });
  }
}
