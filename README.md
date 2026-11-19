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
| `round2.html` | Round 2 instructor page: join QR, learning curve, gallery, rule reveal. |
| `draw.html` | Round 2 team page: pairing, drawing board or judging screen. |
| `round2-rule.js` | Round 2 wording: the prompt, the four judge rules, the reveal. |
| `config.js` | The one line you set: the Apps Script web app URL. |
| `apps-script/Code.gs` | Small backend: stores answers, pairs round 2 teams, relays drawings and verdicts. |

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

## Round 2: Draw for the judges

Students work in teams of two with **one phone per team**. Teams scan the round 2 QR code and are
paired in order of arrival: first team draws (generator), second team judges, third draws, and so on.

- **Generator team:** "Draw a picture that includes a + and an =." They send each drawing and get
  back only *yes* or *no*. They win with three yeses in a row (three different drawings), then type
  their guess at the rule.
- **Judge team:** sees its pair's secret rule: the = must be **above**, **below**, **left of** or
  **right of** the +. Rules go out in a shuffled rotation, so neighbouring pairs usually have
  different rules and overheard tips don't help.
- **Your screen** (`round2.html`): *Learning curve* shows the share of drawings accepted at attempt
  1, 2, 3… across all pairs, plus the generators' guesses next to their real rule. *Gallery* shows each
  rule's accepted and rejected drawings, stacked on top of each other and as thumbnails.

It's a GAN played by people: the generator never sees a valid example, only the judge's verdicts.
Good debrief prompts: pairs whose guess is narrower than the real rule ("draw them small in the
corner") learned what the judge rewards, not the rule (mode collapse, reward hacking).

For a reveal.js deck, embed `round2.html` (join) and `round2.html?view=curve` or `?view=gallery`.
All the instructor pages share one session code and follow each other's **New code**.

## One-time setup (about 5 minutes)

1. Create a blank Google Sheet.
2. *Extensions → Apps Script*. Replace what's there with all of `apps-script/Code.gs` and save.
3. *Deploy → New deployment → ⚙ → Web app*. *Execute as:* **Me**. *Who has access:* **Anyone**.
   Deploy, approve the permissions (if Google says the app isn't verified: *Advanced → Go to …*;
   it's your own script), and copy the URL ending in `/exec`.
4. Paste that URL into `config.js` and push.

Answers land in a **Responses** tab in the Sheet (created on the first submission).

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
- **Tests:** `node tests/test.js` (round 1) and `node tests/test-round2.js` (round 2 backend).
- **Try everything locally:** `node tests/dev-server.js` serves the site at http://localhost:8790 with
  the real `Code.gs` running against an in-memory stand-in for Google. Open several browser windows
  (or private windows) on `draw.html` to play both sides. Add `?demo=1` to any page for fake data.

The validity check is a regular expression, so the hidden grammar is literally a finite-state
machine, a nice tie-in for a symbolic AI class.

`vendor/qrcode.js` is Kazuhiko Arase's `qrcode-generator` (MIT license).
