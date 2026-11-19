// Round 2 wording, shared by the student page and the instructor page. Edit here to change the round.
// Each pair's judges get one of the four rules (the server hands them out in a shuffled rotation).
(function (root) {
  var ROUND2 = {
    artistPrompt: 'Draw a picture that includes a + and an =.',
    artistHelp: 'Another team will judge each drawing with a secret rule and answer only yes or no. ' +
                'Figure out the rule. You win with three yes answers in a row, using three different drawings.',
    rules: {
      above: { short: '= above +',       judge: 'Say YES only if the drawing has a + and an =, and the = is ABOVE the +. Otherwise say NO.' },
      below: { short: '= below +',       judge: 'Say YES only if the drawing has a + and an =, and the = is BELOW the +. Otherwise say NO.' },
      left:  { short: '= left of +',     judge: 'Say YES only if the drawing has a + and an =, and the = is to the LEFT of the +. Otherwise say NO.' },
      right: { short: '= right of +',    judge: 'Say YES only if the drawing has a + and an =, and the = is to the RIGHT of the +. Otherwise say NO.' }
    },
    judgeHelp: 'When you’re not sure, say no. Never tell the artists the rule, and don’t tell other teams either.',
    revealText: 'Every pair’s judges had a secret direction: the = had to be above, below, left of, or right of the +. ' +
                'Nothing else mattered. Neighbouring teams usually had different rules, so overheard tips didn’t help.',
    winStreak: 3
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = ROUND2;
  else root.GVD_ROUND2 = ROUND2;
})(this);
