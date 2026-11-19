// Scoring for Generator vs. Discriminator. Runs in the browser (results page) and in node (tests).
(function (root) {
  function regex(L) {
    // Syllables are consonant + vowel; a bare n may follow any syllable.
    return new RegExp('^(?:[' + L.consonants + '][' + L.vowels + ']n?){' +
                      L.minSyllables + ',' + L.maxSyllables + '}$');
  }

  function normalize(w) {
    return String(w == null ? '' : w).toLowerCase().replace(/[^a-z]/g, '');
  }

  function isValid(L, w) {
    return regex(L).test(normalize(w));
  }

  /** A short, student-readable reason a word does not belong. */
  function whyInvalid(L, raw) {
    var w = normalize(raw), C = L.consonants, V = L.vowels;
    if (!w) return 'blank';
    if (new RegExp('[^' + C + V + ']').test(w)) return 'uses a letter the language never uses';
    if (new RegExp('[' + V + ']{2}').test(w)) return 'two vowels in a row';
    if (new RegExp('^[' + V + ']').test(w)) return 'starts with a vowel';
    // Set aside the one allowed exception (a bare n right after a vowel), then check the rest.
    var core = w.replace(new RegExp('([' + V + '])n(?![' + V + '])', 'g'), '$1');
    if (new RegExp('[' + C + ']{2}').test(core)) return 'two consonants in a row';
    if (new RegExp('[' + C + ']$').test(core)) return 'ends in a consonant (only n is allowed)';
    var syll = core.length / 2;
    if (syll < L.minSyllables) return 'too short';
    if (syll > L.maxSyllables) return 'too long';
    return 'other';
  }

  /** Exact chance that a string of random letters (length 4–10) belongs to the language. */
  function generatorChance(L) {
    // Count valid strings of each length over syllables "CV" and "CVn".
    var cv = L.consonants.length * L.vowels.length, total = 0, n = 0;
    for (var len = 4; len <= 10; len++) {
      var ways = [1];
      for (var i = 1; i <= len; i++) ways[i] = (i >= 2 ? ways[i - 2] * cv : 0) + (i >= 3 ? ways[i - 3] * cv : 0);
      total += ways[len] / Math.pow(26, len);
      n++;
    }
    return total / n;
  }

  function sortCounts(obj) {
    return Object.keys(obj)
      .map(function (k) { return { word: k, count: obj[k] }; })
      .sort(function (a, b) { return b.count - a.count || (a.word < b.word ? -1 : 1); });
  }

  function avgDifficulty(subs) {
    var s = 0, n = 0;
    subs.forEach(function (x) {
      var d = Number(x.difficulty);
      if (d >= 1 && d <= 5) { s += d; n++; }
    });
    return n ? s / n : null;
  }

  /** subs: [{ words: [string], difficulty }] */
  function scoreGenerators(L, subs) {
    var examples = {};
    L.examples.forEach(function (w) { examples[normalize(w)] = true; });
    var out = {
      n: subs.length, words: 0, good: 0, invalid: 0, copied: 0, repeated: 0,
      accuracy: null, chance: generatorChance(L), difficulty: avgDifficulty(subs),
      topWords: [], distinctGood: 0, mistakes: [], invalidSamples: []
    };
    var goodCounts = {}, invalidCounts = {}, reasonCounts = {};
    subs.forEach(function (s) {
      var seen = {};
      (s.words || []).forEach(function (raw) {
        var w = normalize(raw);
        out.words++;
        if (!isValid(L, w)) {
          out.invalid++;
          if (w) invalidCounts[w] = (invalidCounts[w] || 0) + 1;
          var r = whyInvalid(L, w);
          reasonCounts[r] = (reasonCounts[r] || 0) + 1;
        } else if (examples[w]) {
          out.copied++;
        } else if (seen[w]) {
          out.repeated++;
        } else {
          out.good++;
          goodCounts[w] = (goodCounts[w] || 0) + 1;
        }
        seen[w] = true;
      });
    });
    out.accuracy = out.words ? out.good / out.words : null;
    out.distinctGood = Object.keys(goodCounts).length;
    out.topWords = sortCounts(goodCounts).slice(0, 12);
    out.invalidSamples = sortCounts(invalidCounts).slice(0, 8);
    out.mistakes = sortCounts(reasonCounts).map(function (x) { return { reason: x.word, count: x.count }; });
    return out;
  }

  /** subs: [{ answers: { word: 'yes' | 'no' }, difficulty }] */
  function scoreDiscriminators(L, subs) {
    var items = L.testItems.map(function (t) {
      return { word: t.word, belongs: t.belongs, answered: 0, correct: 0, pctCorrect: null };
    });
    var correct = 0, answered = 0;
    subs.forEach(function (s) {
      var a = s.answers || {};
      items.forEach(function (it) {
        var v = a[it.word];
        if (v !== 'yes' && v !== 'no') return;
        it.answered++; answered++;
        if ((v === 'yes') === it.belongs) { it.correct++; correct++; }
      });
    });
    items.forEach(function (it) { it.pctCorrect = it.answered ? it.correct / it.answered : null; });
    return {
      n: subs.length, answered: answered, correct: correct,
      accuracy: answered ? correct / answered : null, chance: 0.5,
      difficulty: avgDifficulty(subs), items: items
    };
  }

  /** rows: [{ role, difficulty, data }] as returned by the Apps Script. */
  function scoreRun(L, rows) {
    var gen = [], disc = [];
    rows.forEach(function (r) {
      if (r.role === 'generator') gen.push({ words: Array.isArray(r.data) ? r.data : [], difficulty: r.difficulty });
      else if (r.role === 'discriminator') disc.push({ answers: r.data || {}, difficulty: r.difficulty });
    });
    return {
      generator: scoreGenerators(L, gen),
      discriminator: scoreDiscriminators(L, disc),
      language: { rule: L.ruleText, reveal: L.revealText, examples: L.examples }
    };
  }

  var API = {
    normalize: normalize, isValid: isValid, whyInvalid: whyInvalid, generatorChance: generatorChance,
    scoreGenerators: scoreGenerators, scoreDiscriminators: scoreDiscriminators, scoreRun: scoreRun
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.GVD_SCORING = API;
})(this);
