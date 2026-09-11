# Retiring simple mode: verification

Verified on 11 September 2026 with synthetic local data in the visible Pixel 9
Android 16 / API 36 ARM64 emulator (`Money2Time_QuickEntry_QA`). The development
client uses the updated JavaScript bundle; no production user data was accessed.

## Upgrade and data preservation

Seeded a version-62 database with `user_mode = 'simple'`, Cash and Simple Wallet,
two categories, and four transactions. The former wallet had a starting balance
of MYR123.45, income of MYR100, an expense of MYR12.50, and a MYR25 transfer to
Cash. Cash also had an existing MYR5 expense.

After a cold app restart and reconnecting the development client to Metro:

- The database version was 63 and the stored mode was `power`.
- All 18 non-settings tables matched the pre-upgrade snapshot exactly, including
  account and transaction IDs, amounts, currencies, links, and exchange rates.
- Settings changed only in the mode flag, Quick Entry preferences, and the
  normal settings update timestamp. Other Quick Entry preferences survived.
- The former wallet became the default account. It remained visible under its
  original name, with a balance of MYR185.95; Cash showed MYR20.00, for total
  assets of MYR205.95.
- The calendar showed the original expense, income, and transfer. All five main
  tabs were available, and Personalize contained Haptics without a mode switch.
- Quick Entry opened with Simple Wallet selected. Blank input disabled Save;
  entering `coffee 5` enabled it. Tapping Save created one MYR5 expense linked
  to the original wallet ID. The wallet balance became MYR180.95 and Cash
  remained MYR20.00.

`accounts.png` and `calendar.png` show the converted data before the new coffee
entry. `quick-entry.png` shows its enabled Save button and wallet selection.
`personalize.png` shows the removed mode switch. These are original emulator
captures; no image was generated or retouched.

## Automated checks

- `npm run check`: TypeScript, ESLint, and Prettier passed.
- `npm test -- --runInBand`: 116 suites, 1,837 tests passed.
- `npx expo export --platform android`: passed, producing the Android Hermes
  bundle and assets.
- Fourteen migration/restore tests execute production SQL against real SQLite
  through Node 22's built-in SQLite module. They cover financial rows and linked
  split bills, receipts, albums, recurring rules, wages, budgets, FX snapshots,
  soft-deleted records, existing power users, missing wallets, empty settings,
  malformed preferences, replay, migration rollback/retry, restoring an old
  backup after migration 63, and rollback when restore conversion fails.
- Account defaults, shortcut catalogs, receipt matching, and retired settings
  have regression coverage. Translation parity and tutorial asset checks pass.
- Failing migration and behavior assertions were observed before implementation.

## Limits

The original report's physical S23+ / One UI 8.5 and Huawei device were not
available. iOS UI and native shortcut execution were not tested; the iOS shortcut
catalog change ships with the rebuilt store app. Voice and receipt resolution
were tested as logic, without invoking microphone or receipt-scanning services.
The old-backup restore path was verified in SQLite integration tests rather than
through a cloud provider on the emulator.

The obsolete website guide is removed in the companion
[website PR #44](https://github.com/NelsonGan/money2time-web/pull/44); its route
types, TypeScript, lint, and production build passed.
