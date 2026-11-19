# Generator vs. Discriminator

A live classroom exercise: half the class becomes **generators**, half becomes **discriminators**,
and everyone learns the same mystery language from a handful of examples. Generators invent new
words that belong to it; discriminators judge which words belong. The projected results page then
shows which task was harder, which is the difference between generative and discriminative models.

| File | What it is |
|---|---|
| `index.html` | Instructor page: session code, QR code to join, live results, rule reveal. |
| `play.html` | Student page: random role (sticky per device), the task itself, submit. |
| `language.js` | The mystery language: rule, examples, test words. Edit this to change the exercise. |
| `scoring.js` | All the scoring (runs in the browser on the results page). |
| `round2.html` | Round 2 instructor page: join QR, live players grid, summary, rule reveal. |
| `place.html` | Round 2 student page: place a + and an =, get ✓ or ✗. |
| `round2-rule.js` | Round 2 wording and the four hidden rules. |
| `config.js` | The one line you set: the Apps Script web app URL. |
| `apps-script/Code.gs` | Small backend: keeps each phone's answers in fast storage and copies them to the Sheet in batches. |

Open `index.html?demo=1` to see everything with a fake class, no setup needed.

## The mystery language

Every syllable is a consonant followed by a vowel (*ka, mi, to*), and a bare **n** may follow any
syllable, at the end (*te-zu-ra-n*) or in the middle (*bo-n-ta-ku*). Any consonant counts
(*y* included) and words can be any length. Students see 16 example words, two with a middle *n*.
Discriminators judge 10 words in a shuffled order: 5 belong, 5 impostors that each break the rule
in one way. The gotcha is *hinporu*: its middle *n* looks like the consonant cluster in the
impostor *kasrino*, but it's allowed.

## How it's scored

- **Generators:** a word counts as good only if it follows the rules, isn't one of the examples, and
  isn't a repeat of their own. Headline: % of all invented words that were good, against the chance
  that random letters happen to fit (under 1%).
- **Discriminators:** % of judgements that were right, against a coin flip (50%).
- Both end with "How hard was that?" (1–5), shown under each score.
- The page also shows popular inventions (and how many different good words the class made), why
  invalid words failed, how many students copied an example, and which words fooled the discriminators.

## Round 2: Find the hidden rule

Everyone plays on their own phone. Students scan the round 2 QR code, tap to place a **+**, tap again
to place an **=**, and press *Check*. The page answers ✓ or ✗ using that student's secret rule:
the = must be **above**, **below**, **left of** or **right of** the +. Rules go out in a shuffled
rotation, so the room is evenly mixed and neighbours usually have different rules. Ten tries; three ✓
in a row wins; then they type their guess at the rule.

Your screen (`round2.html`):
- **Join:** QR code, players, tries, how many found their rule.
- **Players:** a live grid of everyone's latest placement and a 10-slot ✓/✗ strip. Rules stay hidden
  until you press *Reveal the rules*.
- **Summary:** headline numbers, the learning curve (share of ✓ by try number, against the 50% you'd
  get by placing at random), a scatter per rule of where the = landed relative to the +, and every guess.

It's learning from feedback alone: nobody is ever shown a correct example, only ✓ or ✗.

For a reveal.js deck, embed `round2.html` (join), `round2.html?view=players` and `?view=summary`.
All the instructor pages share one session code and follow each other's **New code**.

## One-time setup (about 5 minutes)

1. Create a blank Google Sheet.
2. *Extensions → Apps Script*. Replace what's there with all of `apps-script/Code.gs` and save.
3. *Deploy → New deployment → ⚙ → Web app*. *Execute as:* **Me**. *Who has access:* **Anyone**.
   Deploy, approve the permissions (if Google says the app isn't verified: *Advanced → Go to …*;
   it's your own script), and copy the URL ending in `/exec`.
4. Paste that URL into `config.js` and push.

Answers are copied into the Sheet (tabs **Responses**, **Placements**, **Placement guesses**) in batches while your results pages are open.

## Running it in class

1. Open the site. The session code is today's date and is already inside the QR code.
2. Students scan, get a random role, do the task, and submit. A refresh doesn't change their role.
3. Click **Results**. It updates every few seconds.
4. Ask each group how hard it felt, then **Reveal the rule**.

Reloading keeps the same session. For a second section on the same day, click **New code**
(click twice to confirm): `2026-11-19-b`, `-c`, … Old sessions stay in the Sheet; nothing to clear.

## Changing things

- **Words, examples, the rule:** edit `language.js` and push. No Apps Script redeploy needed.
- **`Code.gs` itself:** *Deploy → Manage deployments → ✏ → Version: New version → Deploy* keeps the same URL.
- **Tests:** `node tests/test.js` (round 1 + backend) and `node tests/test-round2.js` (round 2 backend).
- **Try everything locally:** `node tests/dev-server.js` serves the site at http://localhost:8790 with
  the real `Code.gs` running against an in-memory stand-in for Google. Open several private windows
  on `place.html` to play as several students. Add `?demo=1` to any page for fake data.

The validity check is a regular expression, so the hidden grammar is literally a finite-state
machine, a nice tie-in for a symbolic AI class.

`vendor/qrcode.js` is Kazuhiko Arase's `qrcode-generator` (MIT license).
