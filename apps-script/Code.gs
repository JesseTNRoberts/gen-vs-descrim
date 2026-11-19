/** @OnlyCurrentDoc */
/**
 * Generator vs. Discriminator: storage for both rounds.
 *
 * Setup: in a blank Google Sheet, Extensions → Apps Script, paste this whole file, save,
 * then Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * Put the /exec URL in config.js. Nothing else to run.
 * After changing this file: Deploy → Manage deployments → ✏ → Version: New version → Deploy
 * (keeps the same URL).
 *
 * Round 1 (words):
 *   POST {run, role, client, difficulty, data}     → one row in the "Responses" tab
 *   GET  ?action=rows&run=CODE                     → that session's answers
 *
 * Round 2 (drawings; teams are paired generator/judge in order of arrival, and each pair's
 * judges get one of four rules, handed out in a shuffled rotation):
 *   POST {action:'r2join',  run, client}            → {role, pair}
 *   POST {action:'r2draw',  run, client, img}       → generator sends a drawing (PNG data URL)
 *   POST {action:'r2judge', run, client, attempt, verdict:'yes'|'no'}
 *   POST {action:'r2guess', run, client, guess}     → generator's guess at the rule
 *   GET  ?action=r2state&run=CODE&client=ID         → that team's live state (polled)
 *   GET  ?action=r2stats&run=CODE                   → verdicts and guesses, no images
 *   GET  ?action=r2gallery&run=CODE                 → every judged drawing, with images
 *
 * Live round 2 state is kept in the script cache (fast, no daily quota) and mirrored to
 * script properties on every change, so nothing is lost if the cache drops an entry.
 * Drawings stay in the cache for six hours. The sheet is never touched while teams play:
 * the results page's polling copies new verdicts, drawings and guesses into the "Drawings"
 * and "Guesses" tabs in batches, as a permanent record.
 * All scoring and charts happen in the browser.
 */

const SHEET_NAME = 'Responses';
const HEADERS = ['Timestamp', 'Session', 'Role', 'Device', 'Difficulty', 'Answers'];
const DRAW_SHEET = 'Drawings';
const DRAW_HEADERS = ['Timestamp', 'Session', 'Pair', 'Rule', 'Attempt', 'Verdict', 'Drawing'];
// Each pair's judges get one of these (the = must be above / below / left of / right of the +).
const RULES = ['above', 'below', 'left', 'right'];
const GUESS_SHEET = 'Guesses';
const GUESS_HEADERS = ['Timestamp', 'Session', 'Pair', 'Guess'];
const SIX_HOURS = 21600;
// Bump on every change, so it's easy to check which version a deployment is running (open the /exec URL).
const VERSION = '2026-11-19-no-sheet-in-game';

// ===================================================================
// Entry points
// ===================================================================

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      // Drawing and judging touch only their own pair's state, and the two teams take turns,
      // so they don't hold the script-wide lock; only the brief sheet writes (and joining) do.
      case 'r2join':  return json_(r2Join_(body));
      case 'r2draw':  return json_(r2Draw_(body));
      case 'r2judge': return json_(r2Judge_(body));
      case 'r2guess': return json_(r2Guess_(body));
      default:        return json_(withLock_(() => saveAnswers_(body)));
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const run = String(p.run || '').trim();
  try {
    switch (p.action) {
      case 'rows':      return json_({ ok: true, run: run, rows: rows_(run) });
      case 'r2state':   return json_(r2State_(run, String(p.client || '')));
      case 'r2stats':   return json_(r2Stats_(run));
      case 'r2gallery': return json_(r2Gallery_(run));
      default:          return json_({ ok: true, app: 'generator-vs-discriminator', version: VERSION });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ===================================================================
// Round 1: words
// ===================================================================

function saveAnswers_(body) {
  const row = cleanSubmission_(body);
  // The leading apostrophe keeps Sheets from turning "2026-11-19" into a date.
  sheet_(SHEET_NAME, HEADERS).appendRow([new Date(), "'" + row.run, row.role, "'" + row.client,
                                         row.difficulty, JSON.stringify(row.data)]);
  CacheService.getScriptCache().remove('rows:' + row.run);
  return { ok: true };
}

/** Check and trim what a student page sent, so the sheet only ever holds tidy rows. */
function cleanSubmission_(b) {
  const run = short_(b.run, 40), client = short_(b.client, 40);
  if (!run) throw new Error('missing session code');
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
  return { run: run, role: b.role, client: client, difficulty: difficulty, data: data };
}

/** One session's answers. If a device submitted twice, only its last answer counts. */
function rows_(run) {
  if (!run) throw new Error('missing session code');
  const cache = CacheService.getScriptCache();
  const hit = cache.get('rows:' + run);
  if (hit) return JSON.parse(hit);

  const values = sheet_(SHEET_NAME, HEADERS).getDataRange().getValues().slice(1);
  const latest = {};
  values.forEach(function (v, i) {
    if (String(v[1]) !== run) return;
    let data;
    try { data = JSON.parse(v[5]); } catch (err) { return; }
    const key = v[2] + '|' + (v[3] || ('row' + i));
    latest[key] = { role: v[2], difficulty: Number(v[4]), data: data };
  });
  const out = Object.keys(latest).map((k) => latest[k]);
  try { cache.put('rows:' + run, JSON.stringify(out), 3); } catch (err) { /* too big; fine */ }
  return out;
}

// ===================================================================
// Round 2: drawings
// ===================================================================

const K_ = {
  count:  (run) => 'r2n:' + run,                        // teams joined so far
  team:   (run, client) => 'r2c:' + run + ':' + client, // {role, pair}
  state:  (run, pair) => 'r2s:' + run + ':' + pair,     // {rule, attempt, pending, verdicts}
  image:  (run, pair, attempt) => 'r2i:' + run + ':' + pair + ':' + attempt,
  guess:  (run, pair) => 'r2g:' + run + ':' + pair,
  stats:  (run) => 'r2stats:' + run
};

function r2Join_(b) {
  const run = needRun_(b.run), client = needClient_(b.client);
  const known = getJ_(K_.team(run, client));
  if (known) return { ok: true, role: known.role, pair: known.pair };

  // Hold the lock only long enough to take the next arrival number and record this team.
  let team;
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const again = getJ_(K_.team(run, client));        // a retry that already got in
    if (again) return { ok: true, role: again.role, pair: again.pair };
    const props = PropertiesService.getScriptProperties();
    const n = Number(props.getProperty(K_.count(run)) || 0);
    props.setProperty(K_.count(run), String(n + 1));
    team = { role: n % 2 === 0 ? 'generator' : 'discriminator', pair: Math.floor(n / 2) + 1 };
    putJ_(K_.team(run, client), team);
  } finally {
    lock.releaseLock();
  }
  CacheService.getScriptCache().remove(K_.count(run));
  if (team.role === 'generator') {
    putJ_(K_.state(run, team.pair), { rule: ruleFor_(run, team.pair), attempt: 0, pending: false, verdicts: [] });
  }
  CacheService.getScriptCache().remove(K_.stats(run));
  return { ok: true, role: team.role, pair: team.pair };
}

/** Pair p's rule: the four rules in an order shuffled once per session (seeded by the session code). */
function ruleFor_(run, pair) {
  let seed = 0;
  for (let i = 0; i < run.length; i++) seed = (seed * 31 + run.charCodeAt(i)) % 2147483647;
  seed = seed || 1;
  const order = RULES.slice();
  for (let i = order.length - 1; i > 0; i--) {
    seed = (seed * 16807) % 2147483647;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order[(pair - 1) % order.length];
}

function r2State_(run, client) {
  needRun_(run);
  const team = getJ_(K_.team(run, client));
  if (!team) return { ok: true, joined: false };
  const teams = Number(getJ_(K_.count(run)) || 0);
  const st = getJ_(K_.state(run, team.pair)) || { attempt: 0, pending: false, verdicts: [] };
  const out = {
    ok: true, joined: true, role: team.role, pair: team.pair,
    partner: teams >= team.pair * 2,   // the judge team for this pair has arrived
    attempt: st.attempt, pending: st.pending, verdicts: st.verdicts
  };
  if (team.role === 'discriminator') {
    out.rule = st.rule;   // only the judges are told the rule
    if (st.pending) out.img = CacheService.getScriptCache().get(K_.image(run, team.pair, st.attempt)) || null;
  }
  return out;
}

function r2Draw_(b) {
  const run = needRun_(b.run), team = needTeam_(run, b.client, 'generator');
  const img = String(b.img || '');
  if (img.indexOf('data:image/png;base64,') !== 0 || img.length > 45000) throw new Error('bad drawing');
  const key = K_.state(run, team.pair);
  const st = getJ_(key) || { attempt: 0, pending: false, verdicts: [] };
  if (st.pending) return { ok: true, attempt: st.attempt, already: true };  // a resend after a dropped reply
  st.attempt += 1;
  st.pending = true;
  CacheService.getScriptCache().put(K_.image(run, team.pair, st.attempt), img, SIX_HOURS);
  putJ_(key, st);
  return { ok: true, attempt: st.attempt };
}

function r2Judge_(b) {
  const run = needRun_(b.run), team = needTeam_(run, b.client, 'discriminator');
  if (b.verdict !== 'yes' && b.verdict !== 'no') throw new Error('bad verdict');
  const key = K_.state(run, team.pair);
  const st = getJ_(key);
  if (!st || !st.pending || Number(b.attempt) !== st.attempt) return { ok: true, stale: true };
  st.pending = false;
  st.verdicts.push(b.verdict);
  putJ_(key, st);
  CacheService.getScriptCache().remove(K_.stats(run));
  return { ok: true, attempt: st.attempt };
}

function r2Guess_(b) {
  const run = needRun_(b.run), team = needTeam_(run, b.client, 'generator');
  const guess = short_(b.guess, 300);
  if (!guess) throw new Error('empty guess');
  putJ_(K_.guess(run, team.pair), guess);   // its own key, so it never races a verdict
  CacheService.getScriptCache().remove(K_.stats(run));
  return { ok: true };
}

/** Every pair's rule, verdicts and guess, read in one batch from the cache (properties as backup). */
function r2Pairs_(run) {
  const teams = Number(getJ_(K_.count(run)) || 0);
  const n = Math.ceil(teams / 2), keys = [];
  for (let p = 1; p <= n; p++) keys.push(K_.state(run, p), K_.guess(run, p));
  const v = getAllJ_(keys);
  const pairs = [];
  for (let p = 1; p <= n; p++) {
    const st = v[K_.state(run, p)];
    if (st) pairs.push({ pair: p, rule: st.rule, hasJudge: teams >= p * 2, verdicts: st.verdicts, guess: v[K_.guess(run, p)] || null });
  }
  return { teams: teams, pairs: pairs };
}

/** Verdicts and guesses for the results page (no images, so it is cheap to poll). */
function r2Stats_(run) {
  needRun_(run);
  const cache = CacheService.getScriptCache();
  const hit = cache.get(K_.stats(run));
  if (hit) return JSON.parse(hit);
  const P = r2Pairs_(run);
  const drawings = [], guesses = [];
  P.pairs.forEach((p) => {
    p.verdicts.forEach((v, i) => drawings.push({ pair: p.pair, rule: p.rule, attempt: i + 1, verdict: v }));
    if (p.guess) guesses.push({ pair: p.pair, guess: p.guess });
  });
  const out = {
    ok: true, run: run, teams: P.teams, drawings: drawings, guesses: guesses,
    pairs: P.pairs.map((p) => ({ pair: p.pair, rule: p.rule, hasJudge: p.hasJudge }))
  };
  try { cache.put(K_.stats(run), JSON.stringify(out), 3); } catch (err) {}
  try { archive_(run, P); } catch (err) { /* the record can catch up on the next poll */ }
  return out;
}

/** Every judged drawing with its image, for the gallery. */
function r2Gallery_(run) {
  needRun_(run);
  const P = r2Pairs_(run);
  const keys = [];
  P.pairs.forEach((p) => p.verdicts.forEach((v, i) => keys.push(K_.image(run, p.pair, i + 1))));
  const imgs = CacheService.getScriptCache().getAll(keys);
  const drawings = [];
  P.pairs.forEach((p) => p.verdicts.forEach((v, i) => {
    const img = imgs[K_.image(run, p.pair, i + 1)];
    if (img) drawings.push({ pair: p.pair, rule: p.rule, attempt: i + 1, verdict: v, img: img });
  }));
  return { ok: true, run: run, drawings: drawings };
}

/**
 * Copy new verdicts and guesses into the Drawings and Guesses tabs, as a permanent record.
 * Called from the results page's polling, never from the students' requests, and skipped if
 * another copy is already writing, so the game never waits on the sheet.
 */
function archive_(run, P) {
  const logKey = 'r2logged:' + run;
  const logged = getJ_(logKey) || {};
  const todo = [], gtodo = [];
  P.pairs.forEach((p) => {
    const done = (logged[p.pair] && logged[p.pair].d) || 0;
    for (let i = done; i < p.verdicts.length; i++) todo.push({ pair: p.pair, rule: p.rule, attempt: i + 1, verdict: p.verdicts[i] });
    if (p.guess && !(logged[p.pair] && logged[p.pair].g === p.guess)) gtodo.push(p);
  });
  if (!todo.length && !gtodo.length) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) return;
  try {
    const fresh = getJ_(logKey) || {};             // re-read: another copy may have just written
    const now = new Date();
    const imgs = CacheService.getScriptCache().getAll(todo.map((d) => K_.image(run, d.pair, d.attempt)));
    const rows = todo.filter((d) => d.attempt > ((fresh[d.pair] && fresh[d.pair].d) || 0))
      .map((d) => [now, "'" + run, d.pair, d.rule, d.attempt, d.verdict, imgs[K_.image(run, d.pair, d.attempt)] || '']);
    const grows = gtodo.filter((p) => !(fresh[p.pair] && fresh[p.pair].g === p.guess))
      .map((p) => [now, "'" + run, p.pair, p.guess]);
    if (rows.length) {
      const sh = sheet_(DRAW_SHEET, DRAW_HEADERS);
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
    if (grows.length) {
      const sh = sheet_(GUESS_SHEET, GUESS_HEADERS);
      sh.getRange(sh.getLastRow() + 1, 1, grows.length, grows[0].length).setValues(grows);
    }
    P.pairs.forEach((p) => { fresh[p.pair] = { d: p.verdicts.length, g: p.guess || (fresh[p.pair] && fresh[p.pair].g) || null }; });
    putJ_(logKey, fresh);
  } finally {
    lock.releaseLock();
  }
}

// ===================================================================
// Helpers
// ===================================================================

function short_(s, n) { return String(s == null ? '' : s).trim().slice(0, n); }
function needRun_(run) { const r = short_(run, 40); if (!r) throw new Error('missing session code'); return r; }
function needClient_(c) { const r = short_(c, 40); if (!r) throw new Error('missing device id'); return r; }

function needTeam_(run, client, role) {
  const team = getJ_(K_.team(run, needClient_(client)));
  if (!team) throw new Error('this team has not joined');
  if (team.role !== role) throw new Error('wrong role');
  return team;
}

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

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
