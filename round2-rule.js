// Round 2 wording and the hidden rules, shared by the student page and the instructor page.
// Each player gets one rule. The server hands out four rule slots in a shuffled rotation (so the room
// is evenly mixed) and calls them above / below / left / right; what each slot means is defined here,
// so the rules can change without redeploying the Apps Script.
(function (root) {
  var ROUND2 = {
    title: 'Find the hidden rule',
    help: 'Tap to place a +, then tap to place an =. Press Check and the computer answers ✓ or ✗ ' +
          'using a secret rule about where the two go. You have 10 tries. Three ✓ in a row wins.',
    // Two-part rules: the = must be in one diagonal direction from the +.
    rules: {
      above: { short: '= above and left of +',  test: function (a) { return a.ey < a.py && a.ex < a.px; }, dir: [-1, -1] },
      right: { short: '= above and right of +', test: function (a) { return a.ey < a.py && a.ex > a.px; }, dir: [1, -1] },
      left:  { short: '= below and left of +',  test: function (a) { return a.ey > a.py && a.ex < a.px; }, dir: [-1, 1] },
      below: { short: '= below and right of +', test: function (a) { return a.ey > a.py && a.ex > a.px; }, dir: [1, 1] }
    },
    ruleOrder: ['above', 'right', 'left', 'below'],   // display order: the four diagonals clockwise from top-left
    chance: 0.25,                                     // share of ✓ you'd get by placing at random
    revealText: 'Everyone had a two-part secret rule: the = had to be above or below the +, AND to its left or right. ' +
                'One ✓ only tells you that both parts were right; a ✗ doesn’t say which part was wrong. ' +
                'Your neighbours probably had a different rule from you.',
    winStreak: 3,
    maxAttempts: 10
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = ROUND2;
  else root.GVD_ROUND2 = ROUND2;
})(this);
