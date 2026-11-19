// The mystery language. Everything students see and everything the scoring checks comes from here.
// Edit this file to change the exercise; no redeploy of the Apps Script is needed.
(function (root) {
  var LANGUAGE = {
    // Every syllable is consonant + vowel. A bare "n" may follow any syllable,
    // at the end of a word (te-zu-ra-n) or in the middle (bo-n-ta-ku).
    // Any consonant counts (y is a consonant); any number of syllables.
    consonants: 'bcdfghjklmnpqrstvwxyz',
    vowels: 'aeiou',
    minSyllables: 1,
    maxSyllables: 15,

    ruleText: 'Every syllable is one consonant followed by one vowel (ka, mi, to…). ' +
              'The only exception: a bare “n” can follow any syllable, at the end (te-zu-ra-n) ' +
              'or in the middle (bo-n-ta-ku).',
    revealText: 'The middle “n” was the trap: hinporu looks like kasrino (two consonants together), but it belongs.',

    // What everybody sees before their task. Two have a middle n (yonkira, bontaku).
    examples: [
      'kamino', 'sutera', 'tomeken', 'risuka', 'yonkira', 'nabutan', 'kesobi', 'hiyome',
      'maruten', 'sakudo', 'bontaku', 'tezuran', 'wakeri', 'gomise', 'punaro', 'dokemu'
    ],

    // What discriminators judge (shown in a shuffled order). Half belong, half don't;
    // each impostor breaks exactly one rule. Two real ones end in "n", and hinporu is the
    // gotcha: its middle "n" looks like a consonant cluster but is allowed.
    testItems: [
      { word: 'sorimo',  belongs: true  },
      { word: 'tamekot', belongs: false },  // ends in a consonant that isn't n
      { word: 'haketan', belongs: true  },  // the n-ending exception
      { word: 'kasrino', belongs: false },  // two consonants together
      { word: 'hinporu', belongs: true  },  // the middle-n gotcha
      { word: 'ramis',   belongs: false },  // ends in s
      { word: 'dokiren', belongs: true  },  // the n-ending exception
      { word: 'koaru',   belongs: false },  // two vowels together
      { word: 'miwasu',  belongs: true  },
      { word: 'omika',   belongs: false }   // starts with a vowel
    ],

    wordsPerGenerator: 5
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = LANGUAGE;
  else root.GVD_LANGUAGE = LANGUAGE;
})(this);
