// Round 2 wording and the hidden rules, shared by the student page and the instructor page.
// Each player gets one rule (the server hands them out in a shuffled rotation, so the room is evenly mixed).
(function (root) {
  var ROUND2 = {
    title: 'Find the hidden rule',
    help: 'Tap to place a +, then tap to place an =. Press Check and the computer answers ✓ or ✗ ' +
          'using a secret rule about where the two go. You have 10 tries. Three ✓ in a row wins.',
    rules: {
      above: { short: '= above +',    test: function (a) { return a.ey < a.py; } },
      below: { short: '= below +',    test: function (a) { return a.ey > a.py; } },
      left:  { short: '= left of +',  test: function (a) { return a.ex < a.px; } },
      right: { short: '= right of +', test: function (a) { return a.ex > a.px; } }
    },
    revealText: 'Everyone had one secret rule: the = had to be above, below, left of, or right of the +. ' +
                'Nothing else mattered. Your neighbours probably had a different rule from you.',
    winStreak: 3,
    maxAttempts: 10
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = ROUND2;
  else root.GVD_ROUND2 = ROUND2;
})(this);
