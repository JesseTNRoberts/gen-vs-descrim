// The mystery language. Everything students see and everything the scoring checks comes from here.
// Edit this file to change the exercise; no redeploy of the Apps Script is needed.
(function (root) {
  var LANGUAGE = {
    // Every syllable is consonant + vowel. A word may end with a bare "n".
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

    // What discriminators judge (shown in a shuffled order). Half belong, half don't;
    // each impostor breaks exactly one rule, and two of the real ones end in "n".
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
    ],

    wordsPerGenerator: 5
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = LANGUAGE;
  else root.GVD_LANGUAGE = LANGUAGE;
})(this);
