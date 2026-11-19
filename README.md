# Generator vs. Discriminator

A live classroom exercise: half the class becomes **generators**, half becomes **discriminators**,
and everyone learns the same mystery language from a handful of examples. Generators invent new
words that belong to it; discriminators judge which words belong. The projected results page then
shows which task was harder, which is the difference between generative and discriminative models.

- `index.html`: instructor page. Shows the session code, the QR code to join, and live results.
- `play.html`: what students land on. Randomly assigns a role (sticky per device) and sends them to the right Google Form with the session code already filled in.
- `apps-script/Code.gs`: creates the two Google Forms, scores responses, and serves the live numbers.
- `config.js`: the one line you edit (the Apps Script URL).

Open `index.html?demo=1` to see the whole thing with fake data, no setup needed.

## The mystery language

Every syllable is a consonant followed by a vowel (*ka, mi, to*), and a word may end in a bare
**n**. That's Japanese syllable structure (*su-shi, ra-me-n, Ni-ho-n*), which makes a nice reveal.
Students see 16 example words; discriminators then judge 10 words (5 belong, including two that end
in *n*; 5 impostors, each breaking one rule).

## How it's scored

- **Generators:** a word counts as good only if it follows the rules, isn't one of the examples, and
  isn't a repeat of their own word. The headline is the % of all invented words that were good.
  The baseline is the chance that random letters happen to fit the language (under 1%).
- **Discriminators:** % of judgements that were right, against a coin-flip baseline of 50%.
- Both forms end with "How hard was that?" (1–5), shown under each score.

The results page also shows the popular inventions (how many different good words the whole class
produced is a nice prompt about mode collapse), why invalid words failed, how many students copied
an example (memorization), and which words fooled the discriminators.

## One-time setup (about 10 minutes)

1. **Make the Sheet.** Create a blank Google Sheet (name it anything, e.g. *Generator vs Discriminator*).
2. **Add the script.** In the Sheet: *Extensions → Apps Script*. Delete what's there, paste all of
   `apps-script/Code.gs`, and save.
3. **Run `setup`.** Pick `setup` in the function menu and click *Run*. Approve the permissions
   (it needs to create Forms and write to this Sheet). It creates the two forms, links them to the
   Sheet, and logs their edit links.
4. **Deploy the web app.** *Deploy → New deployment → ⚙ → Web app*.
   *Execute as:* **Me**. *Who has access:* **Anyone**. Click *Deploy* and copy the URL ending in `/exec`.
5. **Connect the site.** Paste that URL into `config.js`.
6. **Publish.** Push this folder to a GitHub repo and turn on GitHub Pages
   (*Settings → Pages → Deploy from branch → main / root*). With your custom domain it will live at
   `jessetnroberts.com/<repo-name>/`.
7. **Check it once.** Open the site, scan the QR code with your phone, and submit a form.
   Open the form in a private window too: if it asks you to sign in to your university account,
   open the form's *Settings → Responses* and turn off *Restrict to users in your organization*.
   If a form says it isn't accepting responses, open it from the log link and click *Publish*.
   Then click *Results*: your submission should show up within a few seconds.

## Running it in class

1. Open the site. The session code is today's date; the QR code already contains it.
2. Students scan and are randomly assigned a role. A refresh doesn't change their role.
3. Click **Results**. It updates every few seconds as submissions arrive.
4. Ask each group how hard it felt, then **Reveal the rule**.

Reloading the page keeps the same session. For a second section on the same day, click
**New code** (it asks you to click twice) to start a fresh session: `2026-11-19-b`, `-c`, …
Old sessions stay in the Sheet; nothing needs clearing.

## Changing things later

- **The language, examples or test words:** edit `LANGUAGE` at the top of `Code.gs`, then run
  `rebuildForms()` so the forms show the new examples, and update the deployment (below).
- **Any change to `Code.gs`:** *Deploy → Manage deployments → ✏ → Version: New version → Deploy*.
  This keeps the same `/exec` URL, so `config.js` doesn't change.
- **Checking scores from the editor:** run `testResults` (or `testResults('2026-11-19')`) and read the log.

## Notes

- The validity check is a regular expression, so the hidden grammar is literally a finite-state
  machine, a nice tie-in for a symbolic AI class.
- The QR code library in `vendor/qrcode.js` is Kazuhiko Arase's `qrcode-generator` (MIT license).
