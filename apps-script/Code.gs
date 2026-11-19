/**
 * Generator vs. Discriminator — Google Apps Script backend.
 *
 * Paste this whole file into Extensions → Apps Script of a blank Google Sheet.
 *   1. Run setup() once. It creates the two Google Forms and links them to the sheet.
 *   2. Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 *   3. Put the web app URL in config.js on the GitHub Pages site.
 *
 * The web app answers two requests:
 *   ?action=config            → prefilled form links for the student page
 *   ?action=results&run=CODE  → live scores for one session (run code)
 *
 * Everything about the hidden language lives in LANGUAGE below. If you change
 * it after setup(), run rebuildForms() so the forms show the new examples.
 */

// ===================================================================
// The hidden language (single source of truth)
// ===================================================================

const LANGUAGE = {
  // Every syllable is consonant + vowel. A word may end with a bare "n".
  // (This is Japanese syllable structure: sushi, ramen, Nihon.)
  consonants: 'kstnhmyrwgzdbp',
  vowels: 'aeiou',
  minSyllables: 2,
  maxSyllables: 5,

  ruleText: 'Every syllable is one consonant followed by one vowel (ka, mi, to…). ' +
            'The only exception: a word may end in a bare “n”.',
  revealText: 'That is the sound structure of Japanese: su-shi, ra-me-n, Ni-ho-n.',

  // What everybody sees before their task.
  examples: [
    'kamino', 'sutera', 'tomeken', 'risuka', 'yomira', 'nabutan', 'kesobi', 'hiyome',
    'maruten', 'sakudo', 'bonami', 'tezuran', 'wakeri', 'gomise', 'punaro', 'dokemu'
  ],

  // What discriminators judge. Half belong, half don't; the ones that don't
  // each break exactly one rule, and two of the ones that do end in "n".
  testItems: [
    { word: 'sorimo',  belongs: true  },
    { word: 'tamekot', belongs: false },  // ends in a consonant that isn't n
    { word: 'haketan', belongs: true  },  // the n-ending exception
    { word: 'kasrino', belongs: false },  // two consonants together
    { word: 'nuyabe',  belongs: true  },
    { word: 'ramis',   belongs: false },  // ends in s
    { word: 'dokiren', belongs: true  },  // the n-ending exception
    { word: 'koaru',   belongs: false },  // two vowels together
    { word: 'miwasu',  belongs: true  },
    { word: 'lomaki',  belongs: false }   // "l" never appears in the language
  ]
};

const ANSWER_YES = 'Belongs';
const ANSWER_NO = 'Doesn’t belong';
const RUN_PLACEHOLDER = 'RUNCODE';

// ===================================================================
// Grammar helpers (pure functions; also used by the tests)
// ===================================================================

function languageRegex_() {
  const c = LANGUAGE.consonants, v = LANGUAGE.vowels;
  return new RegExp('^(?:[' + c + '][' + v + ']){' + LANGUAGE.minSyllables + ',' +
                    LANGUAGE.maxSyllables + '}n?$');
}

function normalizeWord_(w) {
  return String(w == null ? '' : w).toLowerCase().replace(/[^a-z]/g, '');
}

function isValid_(w) {
  return languageRegex_().test(normalizeWord_(w));
}

/** A short, student-readable reason a word does not belong. */
function whyInvalid_(raw) {
  const w = normalizeWord_(raw);
  const C = LANGUAGE.consonants, V = LANGUAGE.vowels;
  if (!w) return 'blank';
  if (new RegExp('[^' + C + V + ']').test(w)) return 'uses a letter the language never uses';
  if (new RegExp('[' + V + ']{2}').test(w)) return 'two vowels in a row';
  if (new RegExp('^[' + V + ']').test(w)) return 'starts with a vowel';
  // Set aside the one allowed exception (a final n after a vowel), then check the rest.
  const core = new RegExp('[' + V + ']n$').test(w) ? w.slice(0, -1) : w;
  if (new RegExp('[' + C + ']{2}').test(core)) return 'two consonants in a row';
  if (new RegExp('[' + C + ']$').test(core)) return 'ends in a consonant (only n is allowed)';
  const syll = core.length / 2;
  if (syll < LANGUAGE.minSyllables) return 'too short';
  if (syll > LANGUAGE.maxSyllables) return 'too long';
  return 'other';
}

/**
 * Chance level for a generator who types random letters (lengths 4–10):
 * exact fraction of such strings that belong to the language.
 */
function generatorChance_() {
  const cv = LANGUAGE.consonants.length * LANGUAGE.vowels.length;
  let total = 0, lengths = 0;
  for (let L = 4; L <= 10; L++) {
    const k = Math.floor(L / 2);
    let count = 0;
    if (k >= LANGUAGE.minSyllables && k <= LANGUAGE.maxSyllables) count = Math.pow(cv, k);
    total += count / Math.pow(26, L);
    lengths++;
  }
  return total / lengths;
}

// ===================================================================
// Scoring (pure functions)
// ===================================================================

/**
 * @param {Array<{words: string[], difficulty: number|null}>} subs
 */
function scoreGenerators_(subs) {
  const examples = new Set(LANGUAGE.examples.map(normalizeWord_));
  const out = {
    n: subs.length, words: 0, good: 0, invalid: 0, copied: 0, repeated: 0,
    accuracy: null, chance: generatorChance_(), difficulty: null,
    topWords: [], distinctGood: 0, mistakes: [], invalidSamples: []
  };
  const goodCounts = {}, invalidCounts = {}, reasonCounts = {};
  let diffSum = 0, diffN = 0;

  subs.forEach(function (s) {
    const seen = new Set();
    s.words.forEach(function (raw) {
      const w = normalizeWord_(raw);
      out.words++;
      if (!isValid_(w)) {
        out.invalid++;
        if (w) invalidCounts[w] = (invalidCounts[w] || 0) + 1;
        const r = whyInvalid_(w);
        reasonCounts[r] = (reasonCounts[r] || 0) + 1;
      } else if (examples.has(w)) {
        out.copied++;
      } else if (seen.has(w)) {
        out.repeated++;
      } else {
        out.good++;
        goodCounts[w] = (goodCounts[w] || 0) + 1;
      }
      seen.add(w);
    });
    if (typeof s.difficulty === 'number' && !isNaN(s.difficulty)) { diffSum += s.difficulty; diffN++; }
  });

  out.accuracy = out.words ? out.good / out.words : null;
  out.difficulty = diffN ? diffSum / diffN : null;
  out.distinctGood = Object.keys(goodCounts).length;
  out.topWords = sortCounts_(goodCounts).slice(0, 12);
  out.invalidSamples = sortCounts_(invalidCounts).slice(0, 8);
  out.mistakes = sortCounts_(reasonCounts).map(function (x) { return { reason: x.word, count: x.count }; });
  return out;
}

/**
 * @param {Array<{answers: Object<string,string>, difficulty: number|null}>} subs
 *        answers maps word → ANSWER_YES / ANSWER_NO
 */
function scoreDiscriminators_(subs) {
  const items = LANGUAGE.testItems.map(function (t) {
    return { word: t.word, belongs: t.belongs, answered: 0, correct: 0, pctCorrect: null };
  });
  let correct = 0, answered = 0, diffSum = 0, diffN = 0;
  subs.forEach(function (s) {
    items.forEach(function (it) {
      const a = s.answers[it.word];
      if (a == null || a === '') return;
      const saidYes = a === ANSWER_YES;
      it.answered++; answered++;
      if (saidYes === it.belongs) { it.correct++; correct++; }
    });
    if (typeof s.difficulty === 'number' && !isNaN(s.difficulty)) { diffSum += s.difficulty; diffN++; }
  });
  items.forEach(function (it) { it.pctCorrect = it.answered ? it.correct / it.answered : null; });
  return {
    n: subs.length, answered: answered, correct: correct,
    accuracy: answered ? correct / answered : null, chance: 0.5,
    difficulty: diffN ? diffSum / diffN : null, items: items
  };
}

function sortCounts_(obj) {
  return Object.keys(obj)
    .map(function (k) { return { word: k, count: obj[k] }; })
    .sort(function (a, b) { return b.count - a.count || (a.word < b.word ? -1 : 1); });
}

// ===================================================================
// Web app
// ===================================================================

function doGet(e) {
  const p = (e && e.parameter) || {};
  let out;
  try {
    if (p.action === 'config') out = publicConfig_();
    else if (p.action === 'results') out = cachedResults_(String(p.run || '').trim());
    else out = { ok: true, app: 'generator-vs-discriminator' };
  } catch (err) {
    out = { error: String(err && err.message || err) };
  }
  const json = JSON.stringify(out);
  if (p.callback && /^[A-Za-z_$][\w$]*$/.test(p.callback)) {
    return ContentService.createTextOutput(p.callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function getConfig_() {
  const raw = PropertiesService.getScriptProperties().getProperty('CONFIG');
  if (!raw) throw new Error('Not set up yet: run setup() in the Apps Script editor.');
  return JSON.parse(raw);
}

function publicConfig_() {
  const cfg = getConfig_();
  return {
    placeholder: RUN_PLACEHOLDER,
    generator: cfg.gen.prefill,
    discriminator: cfg.disc.prefill
  };
}

function cachedResults_(run) {
  if (!run) throw new Error('Missing run code.');
  const cache = CacheService.getScriptCache();
  const key = 'r:' + run;
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const res = results_(run);
  try { cache.put(key, JSON.stringify(res), 3); } catch (err) { /* too big to cache; fine */ }
  return res;
}

function results_(run) {
  const cfg = getConfig_();

  const genSubs = [];
  FormApp.openById(cfg.gen.formId).getResponses().forEach(function (r) {
    const m = responseMap_(r);
    if (String(m[cfg.gen.runItemId] || '').trim() !== run) return;
    genSubs.push({
      words: cfg.gen.wordItemIds.map(function (id) { return m[id] || ''; }),
      difficulty: m[cfg.gen.diffItemId] ? Number(m[cfg.gen.diffItemId]) : null
    });
  });

  const discSubs = [];
  FormApp.openById(cfg.disc.formId).getResponses().forEach(function (r) {
    const m = responseMap_(r);
    if (String(m[cfg.disc.runItemId] || '').trim() !== run) return;
    const answers = {};
    cfg.disc.items.forEach(function (it) { answers[it.word] = m[it.itemId] || ''; });
    discSubs.push({
      answers: answers,
      difficulty: m[cfg.disc.diffItemId] ? Number(m[cfg.disc.diffItemId]) : null
    });
  });

  return {
    run: run,
    updated: new Date().toISOString(),
    generator: scoreGenerators_(genSubs),
    discriminator: scoreDiscriminators_(discSubs),
    language: {
      rule: LANGUAGE.ruleText,
      reveal: LANGUAGE.revealText,
      examples: LANGUAGE.examples
    }
  };
}

function responseMap_(formResponse) {
  const m = {};
  formResponse.getItemResponses().forEach(function (ir) {
    m[String(ir.getItem().getId())] = ir.getResponse();
  });
  return m;
}

// ===================================================================
// One-time setup: create the forms
// ===================================================================

function setup() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('CONFIG')) {
    Logger.log('Already set up — nothing changed. (Run rebuildForms() to make fresh forms.)');
    logLinks();
    return;
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from a Google Sheet: Extensions → Apps Script.');

  const gen = buildGeneratorForm_();
  const disc = buildDiscriminatorForm_();
  gen.form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  disc.form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  nameResponseSheets_(ss, gen.form.getId(), 'Generator responses');
  nameResponseSheets_(ss, disc.form.getId(), 'Discriminator responses');

  props.setProperty('CONFIG', JSON.stringify({ gen: gen.cfg, disc: disc.cfg }));
  logLinks();
}

/** Make brand-new forms (old ones stay in your Drive, unlinked from the app). */
function rebuildForms() {
  PropertiesService.getScriptProperties().deleteProperty('CONFIG');
  setup();
}

function logLinks() {
  const cfg = getConfig_();
  Logger.log('Generator form (edit):     ' + FormApp.openById(cfg.gen.formId).getEditUrl());
  Logger.log('Discriminator form (edit): ' + FormApp.openById(cfg.disc.formId).getEditUrl());
  Logger.log('Next: Deploy → New deployment → Web app → Anyone. Put the /exec URL in config.js.');
}

function examplesText_() {
  return LANGUAGE.examples.join('   ·   ');
}

function commonFormSettings_(form) {
  form.setCollectEmail(false)
      .setAllowResponseEdits(false)
      .setShowLinkToRespondAgain(false)
      .setProgressBar(false)
      .setConfirmationMessage('Done! Eyes up front.');
  try { form.setRequireLogin(false); } catch (err) { /* only exists on Workspace accounts */ }
  try { form.setLimitOneResponsePerUser(false); } catch (err) {}
  form.setAcceptingResponses(true);
  // Newer Google Forms must be "published" before anyone can respond.
  try { if (typeof form.setPublished === 'function') form.setPublished(true); } catch (err) {}
}

function addRunItem_(form) {
  return form.addTextItem()
    .setTitle('Session code')
    .setHelpText('Already filled in for you. Leave it as it is.')
    .setRequired(true);
}

function addDifficultyItem_(form) {
  return form.addScaleItem()
    .setTitle('How hard was that?')
    .setBounds(1, 5)
    .setLabels('Easy', 'Very hard')
    .setRequired(true);
}

function buildGeneratorForm_() {
  const form = FormApp.create('Generator — invent new words');
  commonFormSettings_(form);
  form.setDescription(
    'You are a GENERATOR.\n\n' +
    'Here are ' + LANGUAGE.examples.length + ' words from a language you have never seen:\n\n' +
    examplesText_() + '\n\n' +
    'Your job: invent 5 NEW words that belong to this same language. ' +
    'Don’t copy the examples, and make your five different from each other.');
  const run = addRunItem_(form);

  const letters = FormApp.createTextValidation()
    .setHelpText('Letters only, please.')
    .requireTextMatchesPattern('^\\s*[A-Za-z]+\\s*$')
    .build();
  const words = [];
  for (let i = 1; i <= 5; i++) {
    words.push(form.addTextItem().setTitle('New word ' + i).setRequired(true).setValidation(letters));
  }
  const diff = addDifficultyItem_(form);

  return {
    form: form,
    cfg: {
      formId: form.getId(),
      runItemId: String(run.getId()),
      wordItemIds: words.map(function (w) { return String(w.getId()); }),
      diffItemId: String(diff.getId()),
      prefill: prefillTemplate_(form, run)
    }
  };
}

function buildDiscriminatorForm_() {
  const form = FormApp.create('Discriminator — spot the impostors');
  commonFormSettings_(form);
  form.setDescription(
    'You are a DISCRIMINATOR.\n\n' +
    'Here are ' + LANGUAGE.examples.length + ' words from a language you have never seen:\n\n' +
    examplesText_() + '\n\n' +
    'Your job: some of the ' + LANGUAGE.testItems.length + ' words below belong to this language and ' +
    'some don’t. Decide for each one.');
  const run = addRunItem_(form);

  const items = LANGUAGE.testItems.map(function (t) {
    const it = form.addMultipleChoiceItem()
      .setTitle(t.word)
      .setChoiceValues([ANSWER_YES, ANSWER_NO])
      .setRequired(true);
    return { itemId: String(it.getId()), word: t.word };
  });
  const diff = addDifficultyItem_(form);

  return {
    form: form,
    cfg: {
      formId: form.getId(),
      runItemId: String(run.getId()),
      items: items,
      diffItemId: String(diff.getId()),
      prefill: prefillTemplate_(form, run)
    }
  };
}

function prefillTemplate_(form, runItem) {
  return form.createResponse()
    .withItemResponse(runItem.createResponse(RUN_PLACEHOLDER))
    .toPrefilledUrl();
}

function nameResponseSheets_(ss, formId, name) {
  ss.getSheets().forEach(function (sh) {
    const url = sh.getFormUrl && sh.getFormUrl();
    if (url && url.indexOf(formId) !== -1) {
      try { sh.setName(name); } catch (err) { /* name taken; leave it */ }
    }
  });
}

// ===================================================================
// Handy for checking from the editor
// ===================================================================

/** Logs the scores for a run code, e.g. testResults('2026-11-19'). */
function testResults(run) {
  run = run || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  Logger.log(JSON.stringify(results_(run), null, 2));
}
