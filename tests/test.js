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
                       ['akami', false], ['kantaro', true], ['lomaki', true], ['fovaju', true], ['yuki', true],
                       ['honda', true], ['kanpai', false], ['kamit', false], ['n', false], ['', false],
                       ['nka', false], ['hinporu', true], ['kasrino', false], ['kanna', true]]) {
  assert.strictEqual(S.isValid(L, w), ok, 'edge case ' + w);
}

// ---------- Scoring ----------
// Chance level agrees with brute force on 4-letter strings.
{ let ok = 0; const A = 'abcdefghijklmnopqrstuvwxyz';
  for (const a of A) for (const b of A) for (const c of A) for (const d of A) if (S.isValid(L, a + b + c + d)) ok++;
  const cv = L.consonants.length * L.vowels.length;
  assert.strictEqual(ok, cv * cv + 0, '4-letter count'); }

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

// ---------- Apps Script round 1 path (with fake Google services) ----------
const { loadCodeGs } = require('./fake-gas');
const G = loadCodeGs();
const put = (client, record, run = '2026-11-19') => G.post({ action: 'put', round: 'r1', run, client, record });
assert(put('a', { role: 'generator', difficulty: 4, data: ['sorimo', 'x'] }).ok);
assert(put('a', { role: 'generator', difficulty: 5, data: ['haketan'] }).ok);           // resubmit replaces
assert(put('b', { role: 'discriminator', difficulty: 2, data: right }).ok);
assert(put('c', { role: 'discriminator', difficulty: 2, data: right }, '2026-11-19-b').ok);
assert(!put('z', { role: 'hacker', difficulty: 2, data: [] }).ok);
assert(!G.post({ action: 'put', round: 'r1', run: '', client: 'z', record: { role: 'generator', difficulty: 2, data: [] } }).ok);
const got = G.get({ action: 'all', round: 'r1', run: '2026-11-19' });
assert.strictEqual(got.records.length, 2, 'one record per device per session');
assert.deepStrictEqual(got.records.find((r) => r.role === 'generator').data, ['haketan'], 'last submission wins');
assert.strictEqual(S.scoreRun(L, got.records).discriminator.accuracy, 1);
assert.strictEqual(G.sheets.Responses.rows.length, 3, 'header + two archived rows');
G.get({ action: 'all', round: 'r1', run: '2026-11-19' });
assert.strictEqual(G.sheets.Responses.rows.length, 3, 'archived once');

console.log('generator chance level: ' + (g.chance * 100).toFixed(3) + '%');
console.log('all tests passed');
