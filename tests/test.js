// Run from the repo root: node tests/test.js
const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const L = require(path.join(root, 'language.js'));
const S = require(path.join(root, 'scoring.js'));

// ---------- Language ----------
L.examples.forEach((w) => assert(S.isValid(L, w), 'example does not fit the rule: ' + w));
assert.strictEqual(new Set(L.examples).size, L.examples.length, 'duplicate example');
L.testItems.forEach((t) => {
  assert.strictEqual(S.isValid(L, t.word), t.belongs, 'answer key disagrees with the rule: ' + t.word);
  assert(!L.examples.includes(t.word), 'test word is also an example: ' + t.word);
});
for (const [w, ok] of [['Kamino ', true], ['ka', true], ['kana', true], ['kanan', true], ['kann', false],
                       ['akami', false], ['kantaro', false], ['lomaki', true], ['fovaju', true], ['yuki', true],
                       ['kamit', false], ['n', false], ['', false]]) {
  assert.strictEqual(S.isValid(L, w), ok, 'edge case ' + w);
}

// ---------- Scoring ----------
const g = S.scoreGenerators(L, [
  { words: ['sorimo', 'sorimo', 'kamino', 'tamekot', 'kasrino'], difficulty: 4 },  // 1 good, 1 repeat, 1 copy, 2 invalid
  { words: ['sorimo', 'hanuten', 'mikado', 'zubera', 'yomikan'], difficulty: 3 }   // 5 good
]);
assert.deepStrictEqual([g.words, g.good, g.repeated, g.copied, g.invalid], [10, 6, 1, 1, 2]);
assert.deepStrictEqual(g.topWords[0], { word: 'sorimo', count: 2 });
assert.strictEqual(g.difficulty, 3.5);

const right = Object.fromEntries(L.testItems.map((t) => [t.word, t.belongs ? 'yes' : 'no']));
const allYes = Object.fromEntries(L.testItems.map((t) => [t.word, 'yes']));
const d = S.scoreDiscriminators(L, [{ answers: right, difficulty: 2 }, { answers: allYes, difficulty: 1 }]);
assert.strictEqual(d.accuracy, 0.75);
assert.strictEqual(d.items.find((i) => i.word === 'ramis').pctCorrect, 0.5);
assert.strictEqual(S.scoreRun(L, []).generator.accuracy, null);

// ---------- Apps Script (with a fake Sheet) ----------
const rows = [['Timestamp', 'Session', 'Role', 'Device', 'Difficulty', 'Answers']];
const fakeSheet = {
  appendRow: (r) => rows.push(r.map((v) => (typeof v === 'string' && v[0] === "'") ? v.slice(1) : v)),
  getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
  setFrozenRows: () => {}
};
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => fakeSheet, insertSheet: () => fakeSheet }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
  JSON, Math, String, Number, Object, Array, Date
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', 'Code.gs'), 'utf8'), ctx);
const post = (b) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).text);
const get = (p) => JSON.parse(ctx.doGet({ parameter: p }).text);

assert(post({ run: '2026-11-19', role: 'generator', client: 'a', difficulty: 4, data: ['sorimo', 'x'] }).ok);
assert(post({ run: '2026-11-19', role: 'generator', client: 'a', difficulty: 5, data: ['haketan'] }).ok); // resubmit
assert(post({ run: '2026-11-19', role: 'discriminator', client: 'b', difficulty: 2, data: right }).ok);
assert(post({ run: '2026-11-19-b', role: 'discriminator', client: 'c', difficulty: 2, data: right }).ok);
assert(!post({ run: '2026-11-19', role: 'hacker', client: 'z', difficulty: 2, data: [] }).ok);
assert(!post({ run: '', role: 'generator', client: 'z', difficulty: 2, data: [] }).ok);
const got = get({ action: 'rows', run: '2026-11-19' });
assert.strictEqual(got.rows.length, 2, 'one row per device per session');
assert.deepStrictEqual(got.rows.find((r) => r.role === 'generator').data, ['haketan'], 'last submission wins');
const scored = S.scoreRun(L, got.rows);
assert.strictEqual(scored.discriminator.accuracy, 1);

console.log('generator chance level: ' + (g.chance * 100).toFixed(3) + '%');
console.log('all tests passed');
