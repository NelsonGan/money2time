# Changelog

## 2026-02-18

### Batch 1: Interaction Foundation (Haptics + Toggle UX)

- Added Expo Haptics integration via `lib/haptics.ts`.
- Upgraded `Button` primitive with optional `haptic` prop and safe default tactile feedback for primary actions.
- Reworked Money/Hours toggle in `components/DisplayModeToggle.tsx`:
  - sliding thumb animation
  - bounce on toggle
  - selection haptic feedback
  - strict-mode-safe animation implementation

### Batch 2: Hours Framing + Reflection UI

- Strengthened Hours Mode visibility in transaction list:
  - contextual banner in `screens/TransactionsScreen.tsx`
  - row-level “`Xh Ym` of work” helper in `components/TransactionItem.tsx`.
- Added transaction detail experience in `screens/TransactionDetailScreen.tsx`:
  - hero hours callout (“This cost you about ...”)
  - gentle reflective nudge copy
  - clean detail breakdown card
- Wired transaction row press to open detail sheet from `screens/TransactionsScreen.tsx`.

### Batch 3: Simplification Pass (Reduce Filter Clutter)

- Replaced dense horizontal filter chip groups in advanced filters with dropdown-based selectors:
  - Account filter
  - Category filter
  - Sort filter
- Kept quick type chips for fast high-frequency filtering.

### Batch 4: Wage Flow + Form Delight

- Improved wage calculator flow (`screens/WageCalculatorFlowScreen.tsx`):
  - step progress bar (1-5)
  - tactile feedback on step transitions
  - success haptic on save
- Improved add transaction experience (`screens/AddTransactionScreen.tsx`):
  - supportive hours nudge copy based on typed amount
  - success haptic on successful save
- Expanded design tokens in `lib/designSystem.ts` for richer semantic theming.

### New Dependencies

- `expo-haptics`
  - Purpose: consistent tactile feedback for toggles, selections, primary actions, and save success confirmations.
