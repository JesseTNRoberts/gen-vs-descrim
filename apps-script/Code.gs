/** @OnlyCurrentDoc */
/**
 * Generator vs. Discriminator: storage for both rounds.
 *
 * Setup: in a blank Google Sheet, Extensions → Apps Script, paste this whole file, save,
 * then Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * Put the /exec URL in config.js. Nothing else to run.
 * After changing this file: Deploy → Manage deployments → ✏ → Version: New version → Deploy
 * (keeps the same URL). Open the /exec URL to see which version is live.
 *
 * Every student device keeps one small record per round, stored in the script cache
 * (fast, no daily quota) and mirrored to script properties (durable):
 *
 *   POST {action:'join', round:'r2', run, client}       → {rule}  (round 2: assigns the hidden rule)
 *   POST {action:'put',  round, run, client, record}    → saves that device's record
 *   GET  ?action=all&round=r1|r2&run=CODE               → every record in that session
 *
 * Round 1 record: {role, difficulty, data}   (words or judgements; scored on the results page)
 * Round 2 record: {rule, attempts:[{px,py,ex,ey,v}], guess}
 *   px,py = where the + was placed, ex,ey = where the = was placed (0–1 across / down the board),
 *   v = 'yes' | 'no' (the page judges each placement against the player's rule).
 *
 * Students' requests never touch the Sheet. The results pages' polling copies new records into
 * the "Responses", "Placements" and "Placement guesses" tabs in batches, as a permanent record.
 */

const VERSION = '2026-11-19-everyone-plays';
const SIX_HOURS = 21600;
// Round 2 rules: the = must be above / below / left of / right of the +.
const RULES = ['above', 'below', 'left', 'right'];

const TABS = {
  r1: { name: 'Responses', headers: ['Timestamp', 'Session', 'Role', 'Device', 'Difficulty', 'Answers'] },
  r2: { name: 'Placements', headers: ['Timestamp', 'Session', 'Player', 'Rule', 'Attempt', 'Plus x', 'Plus y', 'Equals x', 'Equals y', 'Verdict'] },
  r2guess: { name: 'Placement guesses', headers: ['Timestamp', 'Session', 'Player', 'Rule', 'Guess'] }
};

const K_ = {
  record: (round, run, client) => 'rec:' + round + ':' + run + ':' + client,
  index:  (round, run) => 'ix:' + round + ':' + run,         // device ids in arrival order
  all:    (round, run) => 'all:' + round + ':' + run,        // 2-second cache of the "all" answer
  logged: (round, run) => 'logged:' + round + ':' + run      // what has been copied to the sheet
};

// ===================================================================
// Entry points
// ===================================================================

function doPost(e) {
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const round = b.round === 'r2' ? 'r2' : b.round === 'r1' ? 'r1' : null;
    if (!round) throw new Error('bad round');
    const run = needRun_(b.run), client = needClient_(b.client);
    if (b.action === 'join') return json_(join_(round, run, client));
    if (b.action === 'put') return json_(put_(round, run, client, b.record));
    throw new Error('bad action');
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'all') {
      const round = p.round === 'r2' ? 'r2' : 'r1';
      return json_(all_(round, needRun_(p.run)));
    }
    return json_({ ok: true, app: 'generator-vs-discriminator', version: VERSION });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ===================================================================
// Join, put, all
// ===================================================================

/** Add a device to the session's list (once) and return its arrival number. */
function enlist_(round, run, client) {
  const key = K_.index(round, run);
  const cached = getJ_(key) || [];
  let i = cached.indexOf(client);
  if (i >= 0) return i;
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const props = PropertiesService.getScriptProperties();
    const list = JSON.parse(props.getProperty(key) || '[]');   // re-read the durable copy inside the lock
    i = list.indexOf(client);
    if (i < 0) { list.push(client); i = list.length - 1; putJ_(key, list); }
    return i;
  } finally {
    lock.releaseLock();
  }
}

function join_(round, run, client) {
  const i = enlist_(round, run, client);
  const out = { ok: true, player: i + 1 };
  if (round === 'r2') out.rule = ruleFor_(run, i + 1);
  return out;
}

function put_(round, run, client, record) {
  const rec = round === 'r1' ? cleanR1_(record) : cleanR2_(record);
  enlist_(round, run, client);
  putJ_(K_.record(round, run, client), rec);
  CacheService.getScriptCache().remove(K_.all(round, run));
  return { ok: true };
}

function all_(round, run) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(K_.all(round, run));
  let out;
  if (hit) {
    out = JSON.parse(hit);
  } else {
    const clients = getJ_(K_.index(round, run)) || [];
    const recs = getAllJ_(clients.map((c) => K_.record(round, run, c)));
    const records = [];
    clients.forEach((c, i) => {
      const r = recs[K_.record(round, run, c)];
      if (r) records.push(Object.assign({ player: i + 1 }, r));
    });
    out = { ok: true, run: run, round: round, players: clients.length, records: records };
    try { cache.put(K_.all(round, run), JSON.stringify(out), 2); } catch (err) {}
  }
  try { archive_(round, run, out.records); } catch (err) { /* catches up on the next poll */ }
  return out;
}

// ===================================================================
// Validation
// ===================================================================

function cleanR1_(b) {
  b = b || {};
  if (b.role !== 'generator' && b.role !== 'discriminator') throw new Error('bad role');
  const difficulty = Math.round(Number(b.difficulty));
  if (!(difficulty >= 1 && difficulty <= 5)) throw new Error('bad difficulty');
  let data;
  if (b.role === 'generator') {
    if (!Array.isArray(b.data)) throw new Error('bad words');
    data = b.data.slice(0, 10).map((w) => short_(w, 30));
  } else {
    if (!b.data || typeof b.data !== 'object') throw new Error('bad answers');
    data = {};
    Object.keys(b.data).slice(0, 30).forEach((k) => {
      const v = b.data[k];
      if (v === 'yes' || v === 'no') data[short_(k, 30)] = v;
    });
  }
  return { role: b.role, difficulty: difficulty, data: data };
}

function cleanR2_(b) {
  b = b || {};
  if (RULES.indexOf(b.rule) < 0) throw new Error('bad rule');
  const num = (x) => { const n = Number(x); if (!(n >= 0 && n <= 1)) throw new Error('bad position'); return Math.round(n * 1000) / 1000; };
  const attempts = (Array.isArray(b.attempts) ? b.attempts : []).slice(0, 10).map((a) => {
    if (a.v !== 'yes' && a.v !== 'no') throw new Error('bad verdict');
    return { px: num(a.px), py: num(a.py), ex: num(a.ex), ey: num(a.ey), v: a.v };
  });
  return { rule: b.rule, attempts: attempts, guess: short_(b.guess, 300) || null };
}

/** Player p's rule: the four rules in an order shuffled once per session (seeded by the session code). */
function ruleFor_(run, player) {
  let seed = 0;
  for (let i = 0; i < run.length; i++) seed = (seed * 31 + run.charCodeAt(i)) % 2147483647;
  seed = seed || 1;
  const order = RULES.slice();
  for (let i = order.length - 1; i > 0; i--) {
    seed = (seed * 16807) % 2147483647;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order[(player - 1) % order.length];
}

// ===================================================================
// The permanent record in the Sheet (written from results-page polling only)
// ===================================================================

function archive_(round, run, records) {
  const logKey = K_.logged(round, run);
  const sig = (r) => round === 'r1' ? 1 : (r.attempts.length + '|' + (r.guess || ''));
  const logged = getJ_(logKey) || {};
  if (!records.some((r) => logged[r.player] !== sig(r))) return;   // nothing new

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) return;                                      // another copy is writing
  try {
    const fresh = JSON.parse(PropertiesService.getScriptProperties().getProperty(logKey) || '{}');
    const now = new Date(), rows = [], grows = [];
    records.forEach((r) => {
      if (fresh[r.player] === sig(r)) return;
      if (round === 'r1') {
        rows.push([now, "'" + run, r.role, r.player, r.difficulty, JSON.stringify(r.data)]);
      } else {
        const prev = fresh[r.player] ? String(fresh[r.player]).split('|') : ['0', ''];
        const done = Number(prev[0]) || 0;
        r.attempts.slice(done).forEach((a, k) => rows.push([now, "'" + run, r.player, r.rule, done + k + 1, a.px, a.py, a.ex, a.ey, a.v]));
        if (r.guess && r.guess !== prev.slice(1).join('|')) grows.push([now, "'" + run, r.player, r.rule, r.guess]);
      }
      fresh[r.player] = sig(r);
    });
    appendRows_(TABS[round], rows);
    if (grows.length) appendRows_(TABS.r2guess, grows);
    putJ_(logKey, fresh);
  } finally {
    lock.releaseLock();
  }
}

function appendRows_(tab, rows) {
  if (!rows.length) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(tab.name);
  if (!sh) { sh = ss.insertSheet(tab.name); sh.appendRow(tab.headers); sh.setFrozenRows(1); }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

// ===================================================================
// Helpers
// ===================================================================

function short_(s, n) { return String(s == null ? '' : s).trim().slice(0, n); }
function needRun_(run) { const r = short_(run, 40); if (!r) throw new Error('missing session code'); return r; }
function needClient_(c) { const r = short_(c, 40); if (!r) throw new Error('missing device id'); return r; }

/** Read a small JSON value: cache first, then script properties. */
function getJ_(key) {
  const cache = CacheService.getScriptCache();
  let s = cache.get(key);
  if (s == null) {
    s = PropertiesService.getScriptProperties().getProperty(key);
    if (s == null) return null;
    cache.put(key, s, SIX_HOURS);
  }
  return JSON.parse(s);
}

/** Read many small JSON values at once: one cache call, properties only for what the cache lost. */
function getAllJ_(keys) {
  const cache = CacheService.getScriptCache();
  const hit = keys.length ? cache.getAll(keys) : {};
  const out = {}, refill = {};
  let props = null;
  keys.forEach((k) => {
    let s = hit[k];
    if (s == null) {
      props = props || PropertiesService.getScriptProperties();
      s = props.getProperty(k);
      if (s != null) refill[k] = s;
    }
    if (s != null) out[k] = JSON.parse(s);
  });
  if (Object.keys(refill).length) cache.putAll(refill, SIX_HOURS);
  return out;
}

/** Write a small JSON value to both the cache and script properties. */
function putJ_(key, value) {
  const s = JSON.stringify(value);
  CacheService.getScriptCache().put(key, s, SIX_HOURS);
  PropertiesService.getScriptProperties().setProperty(key, s);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
