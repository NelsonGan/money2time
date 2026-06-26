---
name: frontend-design
description: Design and build polished, on-brand UI for the money2time React Native app. Use when adding or restyling screens, sheets, cards, charts, or any visible UI; when the user asks for design work, layout, spacing, typography, theming, dark-mode, or visual polish; or when reviewing a screen for visual quality. Enforces NativeWind + the project design system.
---

# Frontend design (money2time)

This app is a local-first React Native (Expo SDK 54, RN 0.81, New Architecture) expense tracker. Its hook is reframing money as **time** at the user's hourly rate. UI must feel calm, premium, and trustworthy — it handles people's money.

Read `CLAUDE.md` first for the architecture map. This skill is the design layer on top of it.

## Non-negotiables

1. **NativeWind only for styling.** Use Tailwind className strings, not inline `StyleSheet` objects, unless a value is genuinely dynamic (animated values, measured layout). Config + theme tokens live in `tailwind.config.js` and `constants/designSystem.ts`.
2. **Never hardcode colors.** All eight theme palettes (sage, ocean, terracotta, slate, amber, indigo, emerald, rosewood) flow through theme CSS vars. Use the semantic theme classes / `useThemeColors()` / `useThemeVars()` — a raw `#hex` or `text-red-500` will break theming and dark mode.
3. **Dark mode is class-based and must work.** Every color needs its `dark:` counterpart (or a semantic token that already resolves both). Verify in both schemes.
4. **Reuse primitives before building new ones.** Check `components/ui/` (`button`, `fat-button`, `card`, `input`, `select`, `text`, `toggle`, `settings`, `theme-modal`, `time-value-inline`) and the cross-feature sheets (`AccountPickerSheet`, `CategoryPickerSheet`, `CurrencyPickerSheet`, `AccountLogoPickerSheet`). Don't reinvent a button or a bottom sheet.
5. **Money/time display goes through the formatters.** Render amounts with `formatAmount(value, settings, { showSign })` and durations with `formatHours(value)`. Respect `settings.displayMode` ('money' | 'time') — when it's 'time', amounts show as hours. The `time-value-inline` component and `getDisplayValueForTransaction` from `useApp()` exist for this.
6. **No font scaling surprises.** Global font scaling is disabled in `App.tsx`; use the `Text` primitive from `components/ui/text`, not raw RN `Text`, so typography stays consistent.

## Design language

- **Typography**: Work Sans for UI, Space Mono for numeric/monospace emphasis (`@expo-google-fonts/*`). Use the `text` primitive variants rather than ad-hoc `fontSize`.
- **Spacing & radius**: pull from the scale in `constants/designSystem.ts`. Favor generous padding, soft rounded corners (cards/sheets), and clear vertical rhythm. Don't crowd.
- **Color use**: theme color is an accent, not a flood. Backgrounds stay neutral (light/dark surface tokens); the accent highlights primary actions, active states, and key figures. Expense/income/transfer have consistent semantic treatment — match existing screens.
- **Motion**: timings/easing live in `constants/motion.ts`; animate with `react-native-reanimated` v4. Keep motion subtle and fast (press scale via `usePressScale`, slide transitions per `navigation/stackOptions.ts`). Liquid-glass effects live in `components/navigation/liquidGlass.ts` / `expo-glass-effect`.
- **Haptics on meaningful interactions**: `void triggerHaptic('selection' | 'medium' | 'success' | 'warning')` — but never on scroll or first paint (a past bug; see git history).
- **Icons**: Lucide via `components/icons/NavIcons`; category emojis via `CategoryEmoji`; account/bank logos via `AccountLogo`.

## Layout & platform

- **Safe areas**: use `react-native-safe-area-context`; respect notches and the bottom nav. The `BottomNav` overlays content — leave bottom padding so lists aren't hidden behind it.
- **Tablet**: wrap wide content in `TabletContentContainer` and branch on `useDeviceLayout()`. Don't let line lengths or cards stretch edge-to-edge on iPad.
- **Lists**: use `@shopify/flash-list` (already the standard) for long transaction/activity lists, not `FlatList`.
- **Sheets/modals**: follow the existing picker-sheet pattern and `theme-modal`; gestures via `react-native-gesture-handler` + keyboard handling via `react-native-keyboard-controller`.
- **Charts**: Skia + `react-native-gifted-charts` / `react-native-graph`. Match the existing insights/calendar visual style; theme the series colors.

## Copy & i18n

- **All user-facing strings go through `I18n.t('key')`.** Add the key to `lib/i18n/locales/en.ts` (source of truth) **and every other locale** (23 total) or `__tests__/i18n/localeParity.test.ts` fails. Never hardcode display text in a component.
- Keep copy short, warm, and concrete. Avoid jargon. Numbers and currency come from formatters, not string interpolation.

## Empty / loading / error states

Every new screen or list needs all three: use `EmptyState`, `LoadingDots` / `ImportingOverlay`, and let errors bubble to `AppErrorBoundary`. Use `Mascot` for friendly empty/onboarding moments where it fits the existing tone.

## Workflow

1. **Locate the pattern.** Find the closest existing screen/component and mirror its structure, spacing, and tokens. Consistency beats novelty.
2. **Compose from primitives.** Build with `components/ui/*` and feature components; only drop to raw RN when nothing fits.
3. **Wire data via `useApp()`** — never read the DB or repositories directly from a component.
4. **Verify visually.** Run the app and inspect with the **Argent MCP tools** (see `.claude/rules/argent.md` and the `argent-*` skills). Always start Metro with `npx expo start --localhost`. Use `argent-test-ui-flow` for flows and `argent-screenshot-diff` for before/after on visible changes. Check **both light and dark**, and **both phone and tablet** if layout changed.
5. **Self-review checklist** before finishing:
   - [ ] No hardcoded colors/hex; theming works across all 8 palettes
   - [ ] Dark mode correct
   - [ ] All strings via `I18n.t` and added to every locale
   - [ ] Amounts via `formatAmount`/`formatHours`, respects display mode
   - [ ] Reused primitives; no duplicated button/sheet/card
   - [ ] Safe-area + bottom-nav padding correct
   - [ ] Empty/loading/error states present
   - [ ] Haptics only on meaningful actions
   - [ ] `npm run check` passes (typecheck + lint + format)

## Anti-patterns (reject these)

- Inline hex colors or `text-red-500`-style literals instead of theme tokens.
- Raw `Text`/`TextInput` instead of the `ui/text` primitive (breaks font-scaling config).
- New bespoke bottom sheet / button when a primitive exists.
- Hardcoded user-facing strings (skips i18n + parity).
- Manual `Intl`/string money formatting instead of `formatAmount`.
- `StyleSheet.create` for static styling that NativeWind can express.
- Reading repositories/DB from a component instead of `useApp()`.
