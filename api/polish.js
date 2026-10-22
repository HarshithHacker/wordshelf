// POST /api/polish  { text, words: [{word, meaning, replaces}] }  →  swaps that use the person's own words
import { polishMessage } from '../lib/word-crew.js';
import { checkLimit } from '../lib/limits.js';
import { str } from '../lib/gemini.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Use POST' });
  const b = req.body || {};
  const text = typeof b.text === 'string' ? b.text.slice(0, 1500) : '';
  if (text.trim().length < 3) return res.status(400).json({ ok: false, message: 'Write a message first.' });
  const words = (Array.isArray(b.words) ? b.words : []).slice(0, 150).map(w => ({
    word: str(w && w.word, 60), meaning: str(w && w.meaning, 200),
    replaces: (Array.isArray(w && w.replaces) ? w.replaces : []).map(x => str(x, 30)).filter(Boolean).slice(0, 6)
  })).filter(w => w.word);
  if (!words.length) return res.status(400).json({ ok: false, message: 'Save a few words first, then Polish can use them.' });
  const blocked = checkLimit(req, { perHour: 40, perDay: 300 });
  if (blocked) return res.status(429).json({ ok: false, message: blocked });
  try {
    res.status(200).json(await polishMessage({ text, words }));
  } catch (e) {
    console.error(e);
    const setup = /not set in Vercel/.test(e.message);
    res.status(500).json({ ok: false, message: setup ? 'Setup needed: ' + e.message + '.' : 'Couldn\'t polish that: ' + String(e.message).slice(0, 140) });
  }
}
