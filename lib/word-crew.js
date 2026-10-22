/* The word crew: turns a looked-up word into a saved card, and polishes messages.

   Agents (CrewAI style, see lib/gemini.js):
   - librarian : explains a word or idiom in plain words, with everyday examples,
                 and files it into a "book" (a theme the words in it share)
   - editor    : rewrites a message using only words the person has learnt

   Facts in code: the dictionary decides whether a single word is real, and code
   checks every suggestion the editor makes before the app sees it. */
import { runTask, str } from './gemini.js';

export const AGENTS = {
  librarian: {
    role: 'a friendly vocabulary coach and librarian',
    goal: 'help someone actually use a new word in their own life today, and shelve it with related words',
    backstory: 'You teach people in their early twenties who meet new words while reading. You explain in plain, warm English, ' +
      'write examples that sound like real texts, emails and conversations (not textbook sentences), and you sort words into ' +
      'themed books the way a good librarian would: by what the words are used for, not by alphabet.'
  },
  editor: {
    role: 'a careful message editor',
    goal: 'make a message sharper and more vivid using only the words and idioms the person has learnt',
    backstory: 'You edit WhatsApp messages, emails and posts. You keep the writer\'s voice and meaning, and you only swap in a ' +
      'learnt word when it truly fits the sentence. You never force a word in. Fewer good swaps beat many awkward ones.'
  }
};

export const TASKS = {
  explain: {
    description: 'The person looked up: "{query}".\n' +
      'Dictionary notes (may be empty, trust them over memory): {dict}\n' +
      'Their existing books: {books}\n\n' +
      'If "{query}" is not a real English word, phrase or idiom (a typo or gibberish), set found to false and suggest the closest real one in did_you_mean.\n' +
      'Otherwise explain the most common meaning in one plain sentence a 20 year old would use, give 2 short everyday example sentences ' +
      '(one casual like a text to a friend, one a bit more formal like a work email), a one line tip for using it today, ' +
      'up to 5 ordinary words or phrases it can replace in a message (lowercase), and a book.\n' +
      'The book is the theme this word shares with others. Reuse an existing book name exactly when it fits well. ' +
      'Otherwise invent a new book name of 2 to 4 words that more words could join later, like "Describing people", ' +
      '"Moods and feelings", "Arguing your point", "Money talk", "Time and pace". Never name a book after the word itself.',
    expected_output: 'JSON matching the schema',
    temperature: 0.4
  },
  polish: {
    description: 'Message to improve:\n"""{text}"""\n\nWords and idioms the person has learnt (word: meaning | can replace):\n{words}\n\n' +
      'Suggest up to 5 swaps. Each swap replaces an exact piece of the message (copy it character for character in "original") ' +
      'with a phrase that uses one learnt word, adjusted for grammar (tense, plural). Only use words from the list. ' +
      'Prefer replacing bland or repeated words (good, nice, very, bad, really, thing, said, big). ' +
      'If nothing fits naturally, return an empty list. Then write "polished": the full message with your swaps applied and nothing else changed.',
    expected_output: 'JSON matching the schema',
    temperature: 0.5
  }
};

const S = (type, extra = {}) => ({ type, ...extra });
const WORD_SCHEMA = {
  type: 'object',
  properties: {
    found: S('boolean'),
    did_you_mean: S('string'),
    word: S('string'),
    kind: S('string', { enum: ['word', 'idiom'] }),
    part_of_speech: S('string'),
    meaning: S('string'),
    examples: S('array', { items: S('string') }),
    use_today: S('string'),
    replaces: S('array', { items: S('string') }),
    book: S('string')
  },
  required: ['found', 'word', 'kind', 'meaning', 'examples', 'book']
};
const POLISH_SCHEMA = {
  type: 'object',
  properties: {
    swaps: S('array', { items: S('object', { properties: { original: S('string'), replacement: S('string'), word: S('string'), why: S('string') }, required: ['original', 'replacement', 'word'] }) }),
    polished: S('string')
  },
  required: ['swaps']
};

/* A free dictionary keeps single words honest. Phrases and idioms skip it. */
async function lookupDictionary(q) {
  if (/\s/.test(q)) return null;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(q), { signal: ctrl.signal });
    clearTimeout(t);
    if (res.status === 404) return { missing: true };
    if (!res.ok) return null;
    const data = await res.json();
    const e = Array.isArray(data) && data[0];
    if (!e) return null;
    const phonetic = e.phonetic || ((e.phonetics || []).find(p => p.text) || {}).text || '';
    const audio = ((e.phonetics || []).find(p => p.audio) || {}).audio || '';
    const senses = (e.meanings || []).slice(0, 3).map(m => m.partOfSpeech + ': ' + ((m.definitions || [])[0] || {}).definition).join(' / ');
    return { word: e.word, phonetic, audio, senses };
  } catch (e) { return null; }
}

export async function explainWord({ query, books }) {
  const dict = await lookupDictionary(query.toLowerCase());
  const out = await runTask({
    agent: AGENTS.librarian, task: TASKS.explain, schema: WORD_SCHEMA,
    inputs: {
      query,
      dict: dict && !dict.missing ? dict.senses : (dict && dict.missing ? 'not in the dictionary as a single word' : 'unavailable'),
      books: books.length ? books.map(b => '"' + b + '"').join(', ') : 'none yet'
    }
  });
  if (!out) throw new Error('the librarian sent back something unreadable');
  if (!out.found) return { ok: true, found: false, didYouMean: str(out.did_you_mean, 60) };

  // Check what came back before the app stores it
  const examples = (Array.isArray(out.examples) ? out.examples : []).map(x => str(x, 220)).filter(Boolean).slice(0, 3);
  let book = str(out.book, 40).replace(/^["']|["']$/g, '');
  const same = books.find(b => b.toLowerCase() === book.toLowerCase());
  if (same) book = same;                                  // keep the exact existing spelling
  const word = str(out.word, 60) || query;
  if (!book || book.toLowerCase() === word.toLowerCase()) book = 'Everyday words';
  const meaning = str(out.meaning, 300);
  if (!meaning || !examples.length) throw new Error('the librarian left out the meaning');
  return {
    ok: true, found: true,
    card: {
      word,
      kind: out.kind === 'idiom' || /\s/.test(word) ? 'idiom' : 'word',
      pos: str(out.part_of_speech, 30),
      phonetic: dict && !dict.missing ? str(dict.phonetic, 60) : '',
      audio: dict && !dict.missing && /^https:\/\//.test(dict.audio) ? dict.audio : '',
      meaning, examples,
      useToday: str(out.use_today, 220),
      replaces: (Array.isArray(out.replaces) ? out.replaces : []).map(x => str(x, 30).toLowerCase()).filter(Boolean).slice(0, 6),
      book
    }
  };
}

export async function polishMessage({ text, words }) {
  const list = words.map(w => `- ${w.word}: ${w.meaning}${w.replaces.length ? ' | ' + w.replaces.join(', ') : ''}`).join('\n');
  const out = await runTask({ agent: AGENTS.editor, task: TASKS.polish, schema: POLISH_SCHEMA, inputs: { text, words: list } });
  if (!out) throw new Error('the editor sent back something unreadable');
  const known = new Map(words.map(w => [w.word.toLowerCase(), w.word]));
  const used = new Set(), swaps = [];
  for (const s of Array.isArray(out.swaps) ? out.swaps : []) {
    const original = str(s && s.original, 200), replacement = str(s && s.replacement, 200);
    const word = known.get(str(s && s.word, 60).toLowerCase());
    // keep only swaps that point at real text in the message and use a learnt word
    if (!original || !replacement || !word || original === replacement) continue;
    if (!text.includes(original) || used.has(original)) continue;
    const stem = word.toLowerCase().split(/\s+/)[0].slice(0, Math.max(3, word.length - 3));
    if (!replacement.toLowerCase().includes(stem)) continue;
    used.add(original);
    swaps.push({ original, replacement, word, why: str(s.why, 160) });
    if (swaps.length >= 5) break;
  }
  return { ok: true, swaps };
}
