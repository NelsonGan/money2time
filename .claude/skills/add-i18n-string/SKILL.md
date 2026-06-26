---
name: add-i18n-string
description: Add, rename, or remove user-facing strings across the money2time i18n locales. Use whenever you introduce or change a string shown in the UI, add an I18n.t('key') call, or touch lib/i18n/locales/*. Keeps all 23 locales in parity so __tests__/i18n/localeParity.test.ts stays green.
---

# Add / change an i18n string (money2time)

All user-facing text goes through `I18n.t('key')` (i18n-js, setup in `lib/i18n/index.ts`). There are **23 locale files** in `lib/i18n/locales/`: `da, de, en, es, fil, fr, hi, id, it, ja, ko, ms, nb, nl, pl, pt, ru, sv, th, tr, uk, vi, zh`. `en.ts` is the **source of truth**.

`__tests__/i18n/localeParity.test.ts` fails the build (CI gate) unless **every** locale:
1. has **exactly** the same key set as `en.ts` — no missing keys, no extra keys,
2. has **no empty-string** values, and
3. **preserves interpolation placeholders** (e.g. `{{count}}`, `%{name}`) identically to `en.ts`.

So adding one string is a 23-file change. Do it as a deliberate, test-driven loop.

## Structure

Locales are nested objects grouped by domain, e.g. `common`, `nav`, `errors`, `ui`, `news`, `home`, `calendar`, `onboarding`, `transactions`, `insights`, `settings`, `tutorial`, `recurring`, `categories`, `accounts`, `wage`, `pro`, `shareEarn`, `widgets`. Keys are referenced dotted: `I18n.t('settings.appLock.title')`. Reuse `common.*` for shared words (Save, Cancel, Done…) instead of duplicating.

## Workflow

1. **Add to `en.ts` first**, in the right group, with the final English copy. If interpolating, use the existing placeholder style in that file (match neighbors).
2. **Run the parity test — watch it go red:** `npx jest __tests__/i18n/localeParity.test.ts`. It will report the new key as missing from the other 22 locales. This is your checklist.
3. **Add the same key to all 22 other locales.** Translate where you can; otherwise fall back to the English value (never leave it empty — empty values fail the test). Keep the **exact same placeholders** in the same form.
4. **Re-run the parity test until green**, then `npm run check` (the files must also pass prettier/lint — match indentation and trailing commas).
5. **Use the key in code:** `I18n.t('group.key')`. Never hardcode the display string in a component.

## Renaming a key

Rename in `en.ts` and **all** locales in the same change, and update every `I18n.t('old')` call site (grep for the old key). Leaving the old key anywhere makes it an "extra key" in some locales → red.

## Removing a key

Delete from `en.ts` **and** all locales (otherwise the leftover is an "extra key"), and remove all call sites.

## Pitfalls

- Adding to `en.ts` only → 22 "missing key" failures.
- Empty string as a placeholder translation → "no empty values" failure (use the English fallback).
- Dropping/renaming an interpolation placeholder in a translation → "preserves interpolation placeholders" failure.
- Forgetting prettier formatting → `npm run check` fails even if parity passes.
- Hardcoding the string in JSX instead of calling `I18n.t`.

## Done when

- The key exists in all 23 locales with non-empty values and matching placeholders.
- All `I18n.t` call sites use it; no stale old keys remain.
- `npx jest __tests__/i18n/localeParity.test.ts` and `npm run check` both pass.
