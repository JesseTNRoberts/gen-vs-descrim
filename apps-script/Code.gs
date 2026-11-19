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
 * Every judged drawing is also written to the "Drawings" tab.
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

// ===================================================================
// Entry points
// ===================================================================

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      // Only joining needs the script-wide lock (it hands out the next arrival number).
      // Drawing and judging touch only their own pair's state, and the two teams take turns,
      // so they skip the lock: a busy classroom never queues behind one slow sheet write.
      case 'r2join':  return json_(withLock_(() => r2Join_(body)));
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
      default:          return json_({ ok: true, app: 'generator-vs-discriminator' });
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
  order:  (run) => 'r2order:' + run,                    // this session's shuffled rule order
  image:  (run, pair, attempt) => 'r2i:' + run + ':' + pair + ':' + attempt,
  stats:  (run) => 'r2stats:' + run
};

function r2Join_(b) {
  const run = needRun_(b.run), client = needClient_(b.client);
  const known = getJ_(K_.team(run, client));
  if (known) return { ok: true, role: known.role, pair: known.pair };
  const n = Number(getJ_(K_.count(run)) || 0);
  const team = { role: n % 2 === 0 ? 'generator' : 'discriminator', pair: Math.floor(n / 2) + 1 };
  if (team.role === 'generator') {
    // A new pair: pick its rule from this session's shuffled rotation.
    let order = getJ_(K_.order(run));
    if (!order) {
      order = RULES.slice();
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      putJ_(K_.order(run), order);
    }
    putJ_(K_.state(run, team.pair), { rule: order[(team.pair - 1) % order.length], attempt: 0, pending: false, verdicts: [] });
  }
  putJ_(K_.count(run), n + 1);
  putJ_(K_.team(run, client), team);
  CacheService.getScriptCache().remove(K_.stats(run));
  return { ok: true, role: team.role, pair: team.pair };
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
  const img = CacheService.getScriptCache().get(K_.image(run, team.pair, st.attempt)) || '';
  sheet_(DRAW_SHEET, DRAW_HEADERS).appendRow([new Date(), "'" + run, team.pair, st.rule, st.attempt, b.verdict, img]);
  CacheService.getScriptCache().remove(K_.stats(run));
  return { ok: true, attempt: st.attempt };
}

function r2Guess_(b) {
  const run = needRun_(b.run), team = needTeam_(run, b.client, 'generator');
  const guess = short_(b.guess, 300);
  if (!guess) throw new Error('empty guess');
  sheet_(GUESS_SHEET, GUESS_HEADERS).appendRow([new Date(), "'" + run, team.pair, guess]);
  CacheService.getScriptCache().remove(K_.stats(run));
  return { ok: true };
}

/** Verdicts and guesses for the results page (no images, so it is cheap to poll). */
function r2Stats_(run) {
  needRun_(run);
  const cache = CacheService.getScriptCache();
  const hit = cache.get(K_.stats(run));
  if (hit) return JSON.parse(hit);

  const d = sheet_(DRAW_SHEET, DRAW_HEADERS);
  const drawings = d.getLastRow() < 2 ? [] :
    d.getRange(2, 1, d.getLastRow() - 1, 6).getValues()
      .filter((v) => String(v[1]) === run)
      .map((v) => ({ pair: Number(v[2]), rule: v[3], attempt: Number(v[4]), verdict: v[5] }));
  const g = sheet_(GUESS_SHEET, GUESS_HEADERS);
  const guesses = g.getLastRow() < 2 ? [] :
    g.getRange(2, 1, g.getLastRow() - 1, 4).getValues()
      .filter((v) => String(v[1]) === run)
      .map((v) => ({ pair: Number(v[2]), guess: String(v[3]) }));
  const teams = Number(getJ_(K_.count(run)) || 0);
  const pairs = [];
  for (let p = 1; p <= Math.ceil(teams / 2); p++) {
    const st = getJ_(K_.state(run, p));
    if (st) pairs.push({ pair: p, rule: st.rule, hasJudge: teams >= p * 2 });
  }
  const out = { ok: true, run: run, teams: teams, pairs: pairs, drawings: drawings, guesses: guesses };
  try { cache.put(K_.stats(run), JSON.stringify(out), 3); } catch (err) {}
  return out;
}

/** Every judged drawing with its image, for the gallery. */
function r2Gallery_(run) {
  needRun_(run);
  const d = sheet_(DRAW_SHEET, DRAW_HEADERS);
  const drawings = d.getLastRow() < 2 ? [] :
    d.getRange(2, 1, d.getLastRow() - 1, 7).getValues()
      .filter((v) => String(v[1]) === run && String(v[6]).indexOf('data:image/png') === 0)
      .map((v) => ({ pair: Number(v[2]), rule: v[3], attempt: Number(v[4]), verdict: v[5], img: String(v[6]) }));
  return { ok: true, run: run, drawings: drawings };
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

/** Write a small JSON value to both the cache and script properties. */
function putJ_(key, value) {
  const s = JSON.stringify(value);
  CacheService.getScriptCache().put(key, s, SIX_HOURS);
  PropertiesService.getScriptProperties().setProperty(key, s);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
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
