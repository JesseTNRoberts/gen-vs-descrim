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
| `config.js` | The one line you set: the Apps Script web app URL. |
| `apps-script/Code.gs` | Tiny backend: saves answers to a Google Sheet and hands them back. |

Open `index.html?demo=1` to see everything with a fake class, no setup needed.

## The mystery language

Every syllable is a consonant followed by a vowel (*ka, mi, to*), and a word may end in a bare
**n**: Japanese syllable structure (*su-shi, ra-me-n, Ni-ho-n*), which makes a nice reveal.
Students see 16 example words. Discriminators judge 10 words in a shuffled order: 5 belong
(two end in *n*), 5 impostors that each break one rule.

## How it's scored

- **Generators:** a word counts as good only if it follows the rules, isn't one of the examples, and
  isn't a repeat of their own. Headline: % of all invented words that were good, against the chance
  that random letters happen to fit (under 1%).
- **Discriminators:** % of judgements that were right, against a coin flip (50%).
- Both end with "How hard was that?" (1–5), shown under each score.
- The page also shows popular inventions (and how many different good words the class made), why
  invalid words failed, how many students copied an example, and which words fooled the discriminators.

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
- **Tests:** `node tests/test.js` checks the language file against its own rule, the scoring, and the backend.

The validity check is a regular expression, so the hidden grammar is literally a finite-state
machine, a nice tie-in for a symbolic AI class.

`vendor/qrcode.js` is Kazuhiko Arase's `qrcode-generator` (MIT license).
