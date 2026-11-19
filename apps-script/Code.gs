/**
 * Generator vs. Discriminator: storage for student answers.
 *
 * Setup: in a blank Google Sheet, Extensions → Apps Script, paste this whole file, save,
 * then Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * Put the /exec URL in config.js. Nothing else to run.
 *
 * It does two things:
 *   POST  {run, role, client, difficulty, data}  → appends one row to the "Responses" tab
 *   GET   ?action=rows&run=CODE                  → that session's answers as JSON
 *
 * All the scoring happens on the results page (scoring.js in the repo).
 */

const SHEET_NAME = 'Responses';
const HEADERS = ['Timestamp', 'Session', 'Role', 'Device', 'Difficulty', 'Answers'];

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const row = cleanSubmission_(body);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      // The leading apostrophe keeps Sheets from turning "2026-11-19" into a date.
      sheet_().appendRow([new Date(), "'" + row.run, row.role, "'" + row.client, row.difficulty,
                          JSON.stringify(row.data)]);
    } finally {
      lock.releaseLock();
    }
    CacheService.getScriptCache().remove('rows:' + row.run);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'rows') return json_({ ok: true, run: p.run, rows: rows_(String(p.run || '').trim()) });
    return json_({ ok: true, app: 'generator-vs-discriminator' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/** Check and trim what a student page sent, so the sheet only ever holds tidy rows. */
function cleanSubmission_(b) {
  const short = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
  const run = short(b.run, 40), client = short(b.client, 40);
  if (!run) throw new Error('missing session code');
  if (b.role !== 'generator' && b.role !== 'discriminator') throw new Error('bad role');
  const difficulty = Math.round(Number(b.difficulty));
  if (!(difficulty >= 1 && difficulty <= 5)) throw new Error('bad difficulty');

  let data;
  if (b.role === 'generator') {
    if (!Array.isArray(b.data)) throw new Error('bad words');
    data = b.data.slice(0, 10).map((w) => short(w, 30));
  } else {
    if (!b.data || typeof b.data !== 'object') throw new Error('bad answers');
    data = {};
    Object.keys(b.data).slice(0, 30).forEach((k) => {
      const v = b.data[k];
      if (v === 'yes' || v === 'no') data[short(k, 30)] = v;
    });
  }
  return { run: run, role: b.role, client: client, difficulty: difficulty, data: data };
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** One session's answers. If a device submitted twice, only its last answer counts. */
function rows_(run) {
  if (!run) throw new Error('missing session code');
  const cache = CacheService.getScriptCache();
  const hit = cache.get('rows:' + run);
  if (hit) return JSON.parse(hit);

  const values = sheet_().getDataRange().getValues().slice(1);
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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
