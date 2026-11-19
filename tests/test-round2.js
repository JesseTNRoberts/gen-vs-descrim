// Run from the repo root: node tests/test-round2.js
const assert = require('assert');
const { loadCodeGs } = require('./fake-gas');
const RULES = ['above', 'below', 'left', 'right'];
const G = loadCodeGs();
const run = '2026-11-19';
const join = (c) => G.post({ action: 'join', round: 'r2', run, client: c });
const put = (c, record) => G.post({ action: 'put', round: 'r2', run, client: c, record });

// Rules rotate through all four, then repeat; rejoining keeps the rule.
const rules = Array.from({ length: 8 }, (_, i) => join('p' + i).rule);
assert.deepStrictEqual(rules.slice(0, 4).slice().sort(), RULES.slice().sort());
assert.deepStrictEqual(rules.slice(4), rules.slice(0, 4));
assert.strictEqual(join('p2').rule, rules[2]);
assert.strictEqual(join('p2').player, 3);

// Saving progress.
const a = (px, py, ex, ey, v) => ({ px, py, ex, ey, v });
assert(put('p0', { rule: rules[0], attempts: [a(.5, .5, .5, .8, 'no')] }).ok);
assert(put('p0', { rule: rules[0], attempts: [a(.5, .5, .5, .8, 'no'), a(.4, .4, .4, .1, 'yes')], guess: 'the = goes up' }).ok);
assert(put('p1', { rule: rules[1], attempts: [a(.2, .2, .9, .9, 'yes')] }).ok);
assert(!put('p1', { rule: 'diagonal', attempts: [] }).ok, 'unknown rule');
assert(!put('p1', { rule: rules[1], attempts: [a(2, .2, .9, .9, 'yes')] }).ok, 'position off the board');
assert(!put('p1', { rule: rules[1], attempts: [a(.2, .2, .9, .9, 'maybe')] }).ok, 'bad verdict');
assert.strictEqual(put('p1', { rule: rules[1], attempts: Array(15).fill(a(.1, .1, .2, .2, 'no')) }).ok, true);

const all = G.get({ action: 'all', round: 'r2', run });
assert.strictEqual(all.players, 8);
assert.strictEqual(all.records.length, 2, 'only players who saved something');
const r0 = all.records.find((r) => r.player === 1);
assert.strictEqual(r0.attempts.length, 2); assert.strictEqual(r0.guess, 'the = goes up');
assert.strictEqual(all.records.find((r) => r.player === 2).attempts.length, 10, 'capped at 10');

// Archive: each attempt and guess copied once.
G.get({ action: 'all', round: 'r2', run });
assert(put('p0', { rule: rules[0], attempts: [a(.5, .5, .5, .8, 'no'), a(.4, .4, .4, .1, 'yes'), a(.3, .6, .3, .2, 'yes')], guess: 'the = goes up' }).ok);
G.get({ action: 'all', round: 'r2', run });
const rows = G.sheets.Placements.rows.slice(1);
assert.strictEqual(rows.length, 3 + 10, 'p0: 3 attempts, p1: 10 attempts, no duplicates');
assert.deepStrictEqual(rows.filter((r) => r[2] === 1).map((r) => r[4]), [1, 2, 3]);
assert.strictEqual(G.sheets['Placement guesses'].rows.length, 2, 'header + one guess');

// Everything survives the cache being wiped.
G.dropCache();
assert.strictEqual(G.get({ action: 'all', round: 'r2', run }).records.length, 2);
assert.strictEqual(join('p9').player, 9);
assert.strictEqual(G.get({ action: 'all', round: 'r2', run: 'other' }).records.length, 0, 'sessions are separate');
assert.strictEqual(G.get({}).version.length > 0, true);
console.log('round 2 backend tests passed');
