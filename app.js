/* Wordshelf: every word you look up gets saved into a themed book,
   one of your words sits at the top all day, and Polish rewrites
   messages with the words you've learnt. Everything is saved on this phone. */
'use strict';

const $ = id => document.getElementById(id);
const STORE_KEY = 'wordshelf_v1';
const GOAL = 3;                                    // uses in a day that make a word "stick"
const CLOTHS = ['#7a2e2e', '#2f4f6b', '#5d6e2f', '#8c5a2b', '#5b3a5e', '#2f6b66', '#9a6f2c', '#45405f'];

/* ---------------- saving on this phone ---------------- */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (s && Array.isArray(s.words)) return { words: s.words, books: s.books || {}, today: s.today || null };
  } catch (e) {}
  return { words: [], books: {}, today: null };
}
let state = load();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Couldn\'t save on this phone. Private browsing can block saving.'); }
}
const rid = () => Math.random().toString(36).slice(2, 10);
const dayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const findWord = id => state.words.find(w => w.id === id);
const byText = t => state.words.find(w => w.word.toLowerCase() === t.trim().toLowerCase());
const bookNames = () => Object.keys(state.books);
const wordsIn = name => state.words.filter(w => w.book === name);

function ensureBook(name) {
  if (!state.books[name]) {
    const used = new Set(Object.values(state.books).map(b => b.cloth));
    const cloth = CLOTHS.find(c => !used.has(c)) || CLOTHS[bookNames().length % CLOTHS.length];
    state.books[name] = { cloth, made: Date.now() };
  }
  return state.books[name];
}
function dropEmptyBooks() {
  for (const name of bookNames()) if (!wordsIn(name).length) delete state.books[name];
}

/* ---------------- today's word ---------------- */
// One word for the whole day. Words you haven't had yet come first (newest looked up first,
// since it's fresh); after that, the one you saw longest ago comes back for another go.
function pickToday(force) {
  const today = dayKey();
  if (!force && state.today && state.today.date === today && findWord(state.today.id)) return;
  if (!state.words.length) { state.today = null; return; }
  const lastSeen = w => (w.featured && w.featured.length ? w.featured[w.featured.length - 1] : '');
  const pool = state.words.filter(w => !state.today || w.id !== state.today.id || state.words.length === 1);
  const fresh = pool.filter(w => !lastSeen(w)).sort((a, b) => b.added - a.added);
  const pick = fresh[0] || pool.slice().sort((a, b) => lastSeen(a).localeCompare(lastSeen(b)))[0];
  setToday(pick.id);
}
function setToday(id) {
  const w = findWord(id); if (!w) return;
  const today = dayKey();
  state.today = { date: today, id, uses: 0 };
  w.featured = (w.featured || []).filter(d => d !== today).concat(today).slice(-20);
  save();
}

/* ---------------- rendering ---------------- */
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function renderToday() {
  const t = state.today, w = t && findWord(t.id);
  $('todayEmpty').hidden = !!w; $('todayFull').hidden = !w;
  if (!w) return renderTries();
  $('todayDate').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  $('todayBook').textContent = w.book;
  $('todayBook').style.setProperty('--cloth', (state.books[w.book] || {}).cloth || CLOTHS[0]);
  $('tWord').textContent = w.word;
  $('tPhon').textContent = w.phonetic || '';
  $('tPos').textContent = w.pos || (w.kind === 'idiom' ? 'idiom' : '');
  $('tSay').hidden = !w.audio && !('speechSynthesis' in window);
  $('tMean').textContent = w.meaning;
  $('tEx').textContent = (w.examples || [])[0] || '';
  $('tTip').textContent = w.useToday || '';
  $('tTip').hidden = !w.useToday;
  renderTally(false);
}
function renderTally(animateLast) {
  const n = state.today ? state.today.uses : 0, svg = $('tally');
  svg.innerHTML = '';
  const NS = 'http://www.w3.org/2000/svg';
  const marks = Math.max(n, GOAL);
  for (let i = 0; i < Math.min(marks, 15); i++) {
    const group = Math.floor(i / 5), k = i % 5, x0 = group * 50;
    const line = document.createElementNS(NS, 'path');
    if (k < 4) { const x = x0 + 6 + k * 9; line.setAttribute('d', `M${x} 4 L${x + 1.5} 30`); }
    else line.setAttribute('d', `M${x0 + 1} 24 L${x0 + 40} 9`);       // the fifth mark crosses the four
    line.setAttribute('class', i < n ? 'mark on' : 'mark');
    if (animateLast && i === n - 1) line.classList.add('fresh');
    svg.appendChild(line);
  }
  const left = GOAL - n;
  $('tallyLabel').textContent = n === 0 ? 'Use it ' + GOAL + ' times today' : left > 0 ? 'Used ' + n + (n === 1 ? ' time' : ' times') + ', ' + left + ' to go' : 'Used ' + n + ' times today';
  $('stamp').hidden = n < GOAL;
  $('usedBtn').textContent = n >= GOAL ? 'Used it again' : 'I used it';
}
function renderTries() {
  const box = $('tries'); box.innerHTML = '';
  if (state.words.length) return;
  for (const t of ['serendipity', 'meticulous', 'bite the bullet', 'nonchalant']) {
    const b = el('button', 'chip', t); b.type = 'button';
    b.onclick = () => { $('q').value = t; lookup(t); };
    box.appendChild(b);
  }
}

function renderShelf() {
  const shelf = $('shelf'); shelf.innerHTML = '';
  const names = bookNames().sort((a, b) => wordsIn(b).length - wordsIn(a).length || state.books[a].made - state.books[b].made);
  $('wordCount').textContent = state.words.length ? state.words.length + (state.words.length === 1 ? ' word' : ' words') : '';
  $('shelfHint').textContent = names.length ? 'Tap a book to open it.' : 'Words that share a theme go in the same book. Look up a word to start your first one.';
  if (!names.length) {
    for (let i = 0; i < 4; i++) { const g = el('span', 'spine ghost'); g.style.setProperty('--h', (130 + i * 17 % 40) + 'px'); shelf.appendChild(g); }
    return;
  }
  names.forEach((name, i) => {
    const n = wordsIn(name).length, b = el('button', 'spine');
    b.type = 'button';
    b.style.setProperty('--cloth', state.books[name].cloth);
    b.style.setProperty('--h', Math.min(250, Math.max(132 + n * 9, 70 + name.length * 8.4)) + 'px');   // tall enough for the title
    b.style.setProperty('--w', Math.min(64, 40 + n * 2) + 'px');
    b.style.setProperty('--tilt', (i % 5 === 3 ? -3 : 0) + 'deg');
    b.setAttribute('aria-label', name + ', ' + n + (n === 1 ? ' word' : ' words'));
    b.append(el('span', 'spine-title', name), el('span', 'spine-n', String(n)));
    b.onclick = () => openBook(name);
    shelf.appendChild(b);
  });
}
function renderRecent() {
  const list = state.words.slice().sort((a, b) => b.added - a.added).slice(0, 8);
  $('recentWrap').hidden = !list.length;
  const ul = $('recent'); ul.innerHTML = '';
  for (const w of list) {
    const li = el('li'), b = el('button', 'chip', w.word);
    b.type = 'button'; b.style.setProperty('--cloth', (state.books[w.book] || {}).cloth || CLOTHS[0]);
    b.onclick = () => showCard(w, 'saved');
    li.appendChild(b); ul.appendChild(li);
  }
}
function renderAll() { pickToday(); renderToday(); renderShelf(); renderRecent(); }

/* ---------------- a word card (after looking up, or from Recent) ---------------- */
function cardBody(w, into) {
  const head = el('div', 'c-head');
  head.append(el('h2', 'c-word', w.word));
  const sub = el('p', 'c-sub', [w.phonetic, w.pos || (w.kind === 'idiom' ? 'idiom' : '')].filter(Boolean).join('   '));
  if (sub.textContent) head.append(sub);
  into.append(head, el('p', 'c-mean', w.meaning));
  const ex = el('ul', 'c-ex');
  (w.examples || []).forEach(x => ex.append(el('li', null, x)));
  into.append(ex);
  if (w.useToday) into.append(el('p', 'c-tip', w.useToday));
}
function bookPicker(w, onDone) {
  const wrap = el('label', 'mover');
  wrap.append(el('span', null, 'Book'));
  const sel = el('select');
  for (const n of bookNames()) { const o = el('option', null, n); o.value = n; if (n === w.book) o.selected = true; sel.append(o); }
  const add = el('option', null, 'New book…'); add.value = '__new'; sel.append(add);
  sel.onchange = () => {
    let to = sel.value;
    if (to === '__new') {
      to = (prompt('Name the new book', '') || '').trim().slice(0, 40);
      if (!to) { sel.value = w.book; return; }
    }
    moveWord(w.id, to); onDone && onDone();
  };
  wrap.append(sel);
  return wrap;
}
function showCard(w, how) {
  const box = $('result'); box.innerHTML = ''; box.hidden = false;
  box.style.setProperty('--cloth', (state.books[w.book] || {}).cloth || CLOTHS[0]);
  const note = el('p', 'c-note');
  note.textContent = how === 'new' ? 'Saved to ' + w.book : how === 'again' ? 'Already on your shelf, in ' + w.book : 'In ' + w.book;
  box.append(note);
  cardBody(w, box);
  const actions = el('div', 'c-actions');
  const isToday = state.today && state.today.id === w.id;
  const todayBtn = el('button', 'btn ink', isToday ? 'Today\'s word' : 'Make it today\'s word');
  todayBtn.type = 'button'; todayBtn.disabled = isToday;
  todayBtn.onclick = () => { setToday(w.id); renderToday(); showCard(w, how); flash($('today')); window.scrollTo({ top: 0, behavior: smooth() }); };
  const close = el('button', 'btn line', 'Done'); close.type = 'button';
  close.onclick = () => { box.hidden = true; $('q').focus(); };
  actions.append(todayBtn, bookPicker(w, () => showCard(findWord(w.id), 'saved')), close);
  box.append(actions);
  box.classList.remove('enter'); void box.offsetWidth; box.classList.add('enter');
}

/* ---------------- looking up ---------------- */
let busy = false;
async function lookup(raw) {
  const q = raw.trim().replace(/\s+/g, ' ');
  $('lookupErr').hidden = true;
  if (q.length < 2 || busy) return;
  const known = byText(q);
  if (known) { showCard(known, 'again'); return; }
  busy = true; setBusy($('lookupBtn'), true, 'Looking up');
  try {
    const res = await fetch('/api/word', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q, books: bookNames() }) });
    const out = await res.json().catch(() => ({ ok: false, message: 'Couldn\'t read the answer. Try again.' }));
    if (!out.ok) throw new Error(out.message || 'Couldn\'t look that up. Try again.');
    if (!out.found) {
      showErr($('lookupErr'), '"' + q + '" isn\'t a word I know.', out.didYouMean && out.didYouMean.toLowerCase() !== q.toLowerCase() ? out.didYouMean : '');
      return;
    }
    if (!out.card || !out.card.word || !out.card.meaning) throw new Error('Couldn\'t look that up. Try again.');
    const again = byText(out.card.word);
    if (again) { showCard(again, 'again'); return; }
    const w = { id: rid(), ...out.card, added: Date.now(), featured: [] };
    ensureBook(w.book);
    state.words.push(w);
    if (!state.today) setToday(w.id); else save();
    renderAll();
    showCard(w, 'new');
    $('q').value = '';
  } catch (e) {
    showErr($('lookupErr'), navigator.onLine === false ? 'You\'re offline. Connect to look up new words.' : e.message);
  } finally { busy = false; setBusy($('lookupBtn'), false, 'Look up'); }
}
function showErr(box, msg, suggestion) {
  box.innerHTML = ''; box.hidden = false;
  box.append(document.createTextNode(msg + ' '));
  if (suggestion) {
    const b = el('button', 'link', 'Look up "' + suggestion + '"'); b.type = 'button';
    b.onclick = () => { $('q').value = suggestion; lookup(suggestion); };
    box.append(b);
  }
}
function setBusy(btn, on, label) { btn.disabled = on; btn.classList.toggle('busy', on); btn.textContent = label + (on ? '…' : ''); }

/* ---------------- books ---------------- */
let openName = null;
function openBook(name) {
  openName = name;
  renderBook();
  const d = $('book');
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
}
function closeBook() { const d = $('book'); if (d.close) d.close(); else d.removeAttribute('open'); }
function renderBook() {
  const name = openName, list = wordsIn(name).sort((a, b) => b.added - a.added);
  if (!list.length) { closeBook(); return; }
  $('book').style.setProperty('--cloth', state.books[name].cloth);
  $('bookTitle').textContent = name;
  $('bookMeta').textContent = list.length + (list.length === 1 ? ' word' : ' words');
  $('renameIn').value = name;
  const ul = $('pages'); ul.innerHTML = '';
  for (const w of list) {
    const li = el('li', 'page');
    const det = el('details');
    const sum = el('summary');
    sum.append(el('span', 'p-word', w.word), el('span', 'p-mean', w.meaning));
    det.append(sum);
    const body = el('div', 'p-body');
    const ex = el('ul', 'c-ex'); (w.examples || []).forEach(x => ex.append(el('li', null, x))); body.append(ex);
    if (w.useToday) body.append(el('p', 'c-tip', w.useToday));
    const acts = el('div', 'c-actions');
    const isToday = state.today && state.today.id === w.id;
    const t = el('button', 'btn ink', isToday ? 'Today\'s word' : 'Make it today\'s word'); t.type = 'button'; t.disabled = isToday;
    t.onclick = () => { setToday(w.id); renderAll(); closeBook(); flash($('today')); window.scrollTo({ top: 0, behavior: smooth() }); };
    const del = el('button', 'btn line danger', 'Delete'); del.type = 'button';
    del.onclick = () => deleteWord(w.id);
    acts.append(t, bookPicker(w, () => renderBook()), del);
    body.append(acts);
    det.append(body);
    li.append(det); ul.append(li);
  }
}
function moveWord(id, to) {
  const w = findWord(id); if (!w || !to || to === w.book) return;
  const from = w.book;
  ensureBook(to); w.book = to; dropEmptyBooks(); save(); renderAll();
  toast('Moved ' + w.word + ' to ' + to);
  if (openName === from && !wordsIn(from).length) openName = to;
}
function deleteWord(id) {
  const i = state.words.findIndex(w => w.id === id); if (i < 0) return;
  const [w] = state.words.splice(i, 1);
  const bookWas = state.books[w.book];
  const wasToday = state.today && state.today.id === id ? state.today : null;
  if (wasToday) state.today = null;
  dropEmptyBooks(); save(); renderAll();
  if ($('book').open) renderBook();
  if (!$('result').hidden && $('result').querySelector('.c-word') && $('result').querySelector('.c-word').textContent === w.word) $('result').hidden = true;
  toast('Deleted ' + w.word, 'Undo', () => {
    state.words.splice(i, 0, w);
    if (!state.books[w.book]) state.books[w.book] = bookWas;
    if (wasToday) {                               // put back today's word, and forget the stand-in picked meanwhile
      const stand = state.today && findWord(state.today.id);
      if (stand && stand.id !== id) stand.featured = (stand.featured || []).filter(d => d !== wasToday.date);
      state.today = wasToday;
    }
    save(); renderAll(); if ($('book').open) renderBook();
  });
}
$('renameForm').addEventListener('submit', e => {
  e.preventDefault();
  const to = $('renameIn').value.trim().slice(0, 40), from = openName;
  if (!to || to === from) return;
  if (state.books[to]) { toast('There\'s already a book called ' + to); return; }
  state.books[to] = state.books[from]; delete state.books[from];
  state.words.forEach(w => { if (w.book === from) w.book = to; });
  openName = to; save(); renderAll(); renderBook(); toast('Renamed to ' + to);
});
$('bookClose').onclick = closeBook;
$('book').addEventListener('click', e => { if (e.target === $('book')) closeBook(); });   // tap outside closes

/* ---------------- I used it ---------------- */
$('usedBtn').onclick = () => {
  if (!state.today) return;
  state.today.uses++;
  const w = findWord(state.today.id); if (w) w.uses = (w.uses || 0) + 1;
  save(); renderTally(true);
  if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
  if (state.today.uses === GOAL) toast(GOAL + ' times. That one\'s sticking.');
};
$('tSay').onclick = () => {
  const w = state.today && findWord(state.today.id); if (!w) return;
  if (w.audio) { new Audio(w.audio).play().catch(() => speak(w.word)); } else speak(w.word);
};
function speak(t) { try { const u = new SpeechSynthesisUtterance(t); u.lang = 'en-US'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {} }

/* ---------------- Polish ---------------- */
let swaps = [];
$('polishForm').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('msg').value;
  $('polishErr').hidden = true;
  if (text.trim().length < 3) { showErr($('polishErr'), 'Write a message first.'); return; }
  if (!state.words.length) { showErr($('polishErr'), 'Save a few words on your shelf first, then Polish can use them.'); return; }
  setBusy($('polishBtn'), true, 'Polishing');
  try {
    const words = state.words.slice().sort((a, b) => b.added - a.added).slice(0, 150)
      .map(w => ({ word: w.word, meaning: w.meaning, replaces: w.replaces || [] }));
    const res = await fetch('/api/polish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, words }) });
    const out = await res.json().catch(() => ({ ok: false, message: 'Couldn\'t read the answer. Try again.' }));
    if (!out.ok) throw new Error(out.message || 'Couldn\'t polish that. Try again.');
    swaps = (out.swaps || []).map(s => ({ ...s, on: true }));
    polishedFor = text;
    renderPolished();
  } catch (err) {
    showErr($('polishErr'), navigator.onLine === false ? 'You\'re offline. Connect to polish a message.' : err.message);
  } finally { setBusy($('polishBtn'), false, 'Polish'); }
});
let polishedFor = '';
// Build the message from pieces so each swap can be switched on and off
function pieces() {
  const text = polishedFor, hits = [];
  swaps.forEach((s, i) => { const at = text.indexOf(s.original); if (at >= 0) hits.push({ at, end: at + s.original.length, i }); });
  hits.sort((a, b) => a.at - b.at);
  const out = []; let pos = 0;
  for (const h of hits) {
    if (h.at < pos) continue;                      // overlapping swap, skip it
    out.push({ text: text.slice(pos, h.at) });
    out.push({ swap: h.i });
    pos = h.end;
  }
  out.push({ text: text.slice(pos) });
  return out;
}
function finalText() { return pieces().map(p => p.text != null ? p.text : (swaps[p.swap].on ? swaps[p.swap].replacement : swaps[p.swap].original)).join(''); }
function renderPolished() {
  $('polished').hidden = false;
  const box = $('polText'); box.innerHTML = '';
  for (const p of pieces()) {
    if (p.text != null) { box.append(document.createTextNode(p.text)); continue; }
    const s = swaps[p.swap];
    const m = el('button', 'swap' + (s.on ? ' on' : ''), s.on ? s.replacement : s.original);
    m.type = 'button'; m.title = s.on ? 'Tap to undo' : 'Tap to use ' + s.word;
    m.onclick = () => { s.on = !s.on; renderPolished(); };
    box.append(m);
  }
  const ul = $('swaps'); ul.innerHTML = '';
  if (!swaps.length) ul.append(el('li', 'none', 'None of your words fit this message naturally. Save more words and try again.'));
  swaps.forEach(s => {
    const li = el('li', s.on ? 'on' : '');
    const b = el('button', 'sw-toggle'); b.type = 'button'; b.setAttribute('aria-pressed', String(s.on));
    b.append(el('span', 'sw-from', s.original), el('span', 'sw-arrow', 'becomes'), el('span', 'sw-to', s.replacement));
    b.onclick = () => { s.on = !s.on; renderPolished(); };
    li.append(b);
    if (s.why) li.append(el('p', 'sw-why', s.why));
    ul.append(li);
  });
  $('shareBtn').hidden = !navigator.share;
  $('copied').textContent = '';
}
$('copyBtn').onclick = async () => {
  const t = finalText();
  try { await navigator.clipboard.writeText(t); $('copied').textContent = 'Copied. Paste it in WhatsApp or your email.'; }
  catch (e) { $('msg').value = t; $('msg').select(); $('copied').textContent = 'Put it in the box above. Select all and copy.'; }
  countUsed(t);
};
$('shareBtn').onclick = () => { const t = finalText(); navigator.share({ text: t }).then(() => countUsed(t)).catch(() => {}); };
// Sending a message with today's word in it counts as using it
function countUsed(t) {
  const w = state.today && findWord(state.today.id);
  if (w && t.toLowerCase().includes(w.word.toLowerCase().split(' ')[0].slice(0, Math.max(3, w.word.length - 2)))) {
    state.today.uses++; save(); renderTally(true); toast('That counts as using ' + w.word + ' today.');
  }
}
$('msg').addEventListener('input', () => { const n = $('msg').value.length; $('polishCount').textContent = n ? n + ' / 1500' : ''; });

/* ---------------- views, toast, little helpers ---------------- */
function showView(v) {
  $('shelfView').hidden = v !== 'shelf'; $('polishView').hidden = v !== 'polish';
  document.querySelectorAll('.tabs button').forEach(b => { if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  try { sessionStorage.setItem('ws_view', v); } catch (e) {}
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach(b => { b.onclick = () => showView(b.dataset.view); });
$('lookupForm').addEventListener('submit', e => { e.preventDefault(); lookup($('q').value); });

let toastT;
function toast(msg, actLabel, act) {
  $('toastTxt').textContent = msg;
  const b = $('toastBtn'); b.hidden = !actLabel;
  if (actLabel) { b.textContent = actLabel; b.onclick = () => { act(); $('toast').hidden = true; }; }
  $('toast').hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { $('toast').hidden = true; }, actLabel ? 6000 : 2600);
}
const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
function flash(node) { node.classList.remove('flash'); void node.offsetWidth; node.classList.add('flash'); }

// A new day can start while the app is open (or left in the background overnight)
document.addEventListener('visibilitychange', () => { if (!document.hidden) { state = load(); renderAll(); } });

// Let it work offline and be added to the home screen
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

renderAll();
try { const v = sessionStorage.getItem('ws_view'); if (v === 'polish') showView('polish'); } catch (e) {}
// Opened from a shared link like /?q=word
const shared = new URLSearchParams(location.search).get('q');
if (shared) { $('q').value = shared.slice(0, 60); lookup(shared); history.replaceState(null, '', location.pathname); }
