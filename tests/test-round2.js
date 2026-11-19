// Run from the repo root: node tests/test-round2.js
const assert = require('assert');
const { loadCodeGs } = require('./fake-gas');
const G = loadCodeGs();
const run = '2026-11-19';
const img = 'data:image/png;base64,' + 'A'.repeat(4000);

// Teams alternate generator / judge in order of arrival.
const join = (c) => G.post({ action: 'r2join', run, client: c });
assert.deepStrictEqual([join('t1'), join('t2'), join('t3')].map((r) => r.role + r.pair),
                       ['generator1', 'discriminator1', 'generator2']);
assert.strictEqual(join('t1').role, 'generator', 'rejoining keeps the role');
assert.strictEqual(join('t3').pair, 2);

// Only the judges are told their pair's rule; rules rotate through all four directions.
const RULES = ['above', 'below', 'left', 'right'];
assert(RULES.includes(G.get({ action: 'r2state', run, client: 't2' }).rule), 'judge sees the rule');
assert.strictEqual(G.get({ action: 'r2state', run, client: 't1' }).rule, undefined, 'generator does not');
{ const H = loadCodeGs(); const seen = [];
  for (let i = 0; i < 16; i++) H.post({ action: 'r2join', run: 'rot', client: 'c' + i });
  for (let i = 1; i < 16; i += 2) seen.push(H.get({ action: 'r2state', run: 'rot', client: 'c' + i }).rule);
  assert.deepStrictEqual(seen.slice(0, 4).sort(), RULES.slice().sort(), 'first four pairs get four different rules');
  assert.deepStrictEqual(seen.slice(4), seen.slice(0, 4), 'then the rotation repeats'); }

// Pair 2 has no judge yet.
assert.strictEqual(G.get({ action: 'r2state', run, client: 't3' }).partner, false);
assert.strictEqual(G.get({ action: 'r2state', run, client: 't1' }).partner, true);

// Generator draws; judge sees it; judge says no; generator sees the verdict.
assert.strictEqual(G.post({ action: 'r2draw', run, client: 't1', img }).attempt, 1);
assert.strictEqual(G.post({ action: 'r2draw', run, client: 't1', img }).already, true, 'no second drawing while waiting');
let judge = G.get({ action: 'r2state', run, client: 't2' });
assert.strictEqual(judge.pending, true); assert.strictEqual(judge.img, img);
assert(!G.post({ action: 'r2judge', run, client: 't1', attempt: 1, verdict: 'yes' }).ok, 'generator cannot judge');
assert(!G.post({ action: 'r2draw', run, client: 't2', img }).ok, 'judge cannot draw');
assert(G.post({ action: 'r2judge', run, client: 't2', attempt: 1, verdict: 'no' }).ok);
assert.strictEqual(G.post({ action: 'r2judge', run, client: 't2', attempt: 1, verdict: 'yes' }).stale, true, 'double tap ignored');
let gen = G.get({ action: 'r2state', run, client: 't1' });
assert.strictEqual(gen.pending, false); assert.deepStrictEqual(gen.verdicts, ['no']);

// Three more rounds, then a guess.
for (const v of ['yes', 'yes', 'yes']) {
  const a = G.post({ action: 'r2draw', run, client: 't1', img }).attempt;
  G.post({ action: 'r2judge', run, client: 't2', attempt: a, verdict: v });
}
assert(G.post({ action: 'r2guess', run, client: 't1', guess: 'the = goes under the +' }).ok);
assert(!G.post({ action: 'r2draw', run, client: 't1', img: 'data:text/html,hi' }).ok, 'only PNG drawings');

// State survives the cache being wiped (properties are the backup).
G.dropCache();
gen = G.get({ action: 'r2state', run, client: 't1' });
assert.deepStrictEqual(gen.verdicts, ['no', 'yes', 'yes', 'yes']);
assert.strictEqual(join('t4').pair, 2, 'counter survives the cache wipe');

// Results endpoints.
const stats = G.get({ action: 'r2stats', run });
assert.strictEqual(stats.teams, 4);
assert.deepStrictEqual(stats.drawings.map((d) => d.verdict), ['no', 'yes', 'yes', 'yes']);
assert.strictEqual(stats.guesses[0].guess, 'the = goes under the +');
assert.strictEqual(stats.pairs.length, 2); assert(RULES.includes(stats.drawings[0].rule));
assert.strictEqual(stats.pairs[0].rule, stats.drawings[0].rule);
const gal = G.get({ action: 'r2gallery', run });
assert.strictEqual(gal.drawings.length, 4); assert.strictEqual(gal.drawings[0].img, img);
assert(RULES.includes(gal.drawings[0].rule));
assert.strictEqual(G.get({ action: 'r2stats', run: 'other' }).drawings.length, 0, 'sessions are separate');

// Round 1 still works alongside.
assert(G.post({ run, role: 'generator', client: 'x', difficulty: 3, data: ['kana'] }).ok);
assert.strictEqual(G.get({ action: 'rows', run }).rows.length, 1);

console.log('round 2 backend tests passed');
