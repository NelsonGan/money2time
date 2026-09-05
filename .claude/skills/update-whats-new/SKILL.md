---
name: update-whats-new
description: Write the store "What's New" release note for money2time and open a PR on the money2time-screenshots-creator repo. Use when someone asks to update the What's New / release notes / store listing copy, after a batch of user-facing commits has landed, or before cutting a release to the App Store or Play.
---

# Writing the next What's New

The store note lives in a **different repo**: `~/Projects/money2time-screenshots-creator`,
in `src/data/appDescriptions.ts`, as a `whatsNew` field on each of **23 locale entries**.
That file is the single source for both stores. Uploading is a separate act (the
Descriptions view, or `npm run upload:*`); this skill only writes the copy and opens the PR.

Two things about the shape of the change, both easy to get wrong:

- **The note is replaced, not appended.** Every past commit is N insertions / N deletions.
  A What's New is what changed in *this* release, not a changelog that grows.
- **All 23 locales move together.** English is the source; the other 22 are translated in
  the same commit. A locale left on the previous release ships last month's note to those
  users, and nothing in CI catches it.

## 1. Find the boundary

Everything already described is off the table. Two signals, and you need both:

```bash
cd ~/Projects/money2time-screenshots-creator
git status --porcelain          # must be empty; stop and ask if it is not
git checkout main && git pull
git log -1 --format=%ad --date=iso -- src/data/appDescriptions.ts   # when the last note landed
sed -n '/^  en: {/,/^  },/p' src/data/appDescriptions.ts | sed -n '/whatsNew/,/`,$/p'  # what it said
```

Then list the app commits since that date, with a day of overlap because a note is usually
written a day or two after the commits it covers:

```bash
cd ~/Projects/money2time && git log --format="%h %ad %s" --date=short --since=<date minus 1 day>
```

Read the previous English note and strike anything it already announced. What is left is
the candidate set.

## 2. Keep only what a user would notice

Drop version bumps, CI and tooling, docs and `CLAUDE.md`, refactors, analytics volume
changes, test-only work, and internal cleanups. Judgment calls are real here: "Redraw
alternate app icon artwork" is not news if the previous note already announced alternate
icons, and a fix nobody could have hit is not worth a line.

Read the PR body or the diff when a commit title is ambiguous. A line has to be something
a user can recognise having wanted.

**If nothing user-facing is left, stop and say so.** Do not open an empty PR.

## 3. Write the English

Look at the last few notes for register (`git log -p -- src/data/appDescriptions.ts`). The
shape is fixed:

```
- Hold a transaction to duplicate it onto any day you pick
- Fixed the monthly recap reminder when your month starts after the 28th

Lost time is never found again.
```

- **At most five bullets.** Features first, then fixes.
- **Write from the user's seat, not the commit's.** "Hold a transaction to duplicate it
  onto any day you pick", not "Duplicate a transaction from the hold-to-select toolbar".
  Say what they can now do, and where, in one line without a subordinate clause.
- Tag a single-platform feature: `(iPhone)`, `(Android)`.
- **No em or en dashes**, here or in any translation. Commas, colons, parentheses. This is
  the app's copywriting rule and the store note is app copy.
- Blank line, then **one finance or time quote**, one sentence, **no attribution**.

The quote rotates and **must not repeat**. Pull every past one first:

```bash
cd ~/Projects/money2time-screenshots-creator
for c in $(git log --format=%h -- src/data/appDescriptions.ts); do
  git show "${c}:src/data/appDescriptions.ts" 2>/dev/null |
    python3 -c "import sys,re;m=re.search(r'whatsNew: \`(.*?)\`,',sys.stdin.read(),re.S);print(m.group(1).rsplit(chr(10),1)[-1] if m else '')"
done | sort -u
```

Note the **braces**: in zsh, `$c:src/...` is parsed as a substitution modifier and you get a
diff instead of the file, silently comparing against the wrong text. Use `"${c}:path"`.

Ones already spent include "Lost time is never found again", "Time is the coin of your
life", "Beware of little expenses; a small leak will sink a great ship", "Frugality can make
a poor person rich", "Do not save what is left after spending", and the *Your Money or Your
Life* life-energy lines. Reach for something that fits the release rather than the most
famous quote left.

## 4. Translate all 22 others

Do it yourself, inline, in the same edit. (`/api/translate` exists but wants
`ANTHROPIC_API_KEY` and a running Next server; every past note was translated inline.)

The locales, in file order: `en zh de fr es pt it nl ru ja ko hi id tr vi th pl uk sv nb
da ms fil`. Match with `^  [a-z]{2,3}: {` — **`fil` is three letters** and a `{2}` regex
drops it.

- Read each locale's current `whatsNew` for its register before overwriting it.
- Keep **Money2Time** untranslated.
- Translate the quote **idiomatically**. If the language has its own proverb saying the same
  thing, use it; a literal rendering of an English aphorism reads like a machine.
- Keep the bullet structure identical, one bullet per English bullet, `- ` prefix.
- The `description` field above it is not part of this change. Leave it alone.

## 5. Verify before the PR

```bash
cd ~/Projects/money2time-screenshots-creator && npx tsc --noEmit
```

Then check three things that `tsc` cannot see:

1. **All 23 entries changed**, and each has the same bullet count as English plus a quote
   line. `git diff --stat` on a healthy note is a near-symmetric N/N.
2. **No em or en dash** anywhere in the diff: `git diff -U0 | grep -n '[–—]'`.
3. **Every locale's note is under 500 characters.** Play's release note cap is 500 and
   `uploadAndroidReleaseNotes` in `src/data/storeUpload.mjs` **silently truncates** with
   `.slice(0, 500)` rather than failing, so an overrun ships a note cut off mid-word with
   the quote gone. Russian, Hindi, Thai and German run longest. The App Store's 4000 never
   binds.

```bash
python3 - <<'PY'
import re
src = open('src/data/appDescriptions.ts').read()
for loc, note in re.findall(r"\n  ([a-z]{2,3}): \{.*?whatsNew: `(.*?)`,", src, re.S):
    flag = '  <-- OVER 500' if len(note) > 500 else ''
    print(f"{loc:4} {len(note):4}{flag}")
PY
```

## 6. Branch, commit, PR

Name the release after its headline feature (the slug the PR title uses too):

```bash
cd ~/Projects/money2time-screenshots-creator
git checkout -b whats-new-<slug>-release
git commit -am "Update What's New for the <slug> release across all locales"
gh pr create --title "Update What's New for the <slug> release across all locales" --body "..."
```

Body, in the shape of PR #17: one opening line ("Two lines this release, in all 23
locales:"), the **English note in a fenced block**, then a sentence per line saying which app
PR it came from as `NelsonGan/money2time#NNN` (cross-repo links resolve), with the *why* for
anything a reader would not guess from the bullet. Close with the rotating-quote note and
that `npx tsc --noEmit` passes. Append this session's own attribution block, the one the
system prompt gives you, rather than copying a previous PR's session URL.

Open the PR and stop. Do not merge, and do not upload to either store: an upload writes to a
live listing and is the user's call.
