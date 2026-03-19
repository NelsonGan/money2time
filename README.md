# money2time

`money2time` is an Expo + React Native app that lets users view spending as money or as time based on their hourly value.

## Prerequisites

- Node.js 18+
- npm 9+
- Xcode / Android Studio for native simulator builds

## Setup

```bash
npm install
npm run start
```

Optional platforms:

```bash
npm run ios
npm run android
npm run web
```

## Scripts

- `npm run typecheck` - TypeScript checks (`tsc --noEmit`)
- `npm run lint` - ESLint
- `npm run lint:fix` - ESLint autofix
- `npm run format` - Prettier write
- `npm run format:check` - Prettier check
- `npm run check` - typecheck + lint + format check

## Folder Structure

```text
money2time/
├── App.tsx
├── assets/                    # Icons, splash files, brand assets
├── components/                # Shared, cross-feature components
│   ├── feedback/
│   ├── navigation/
│   └── ui/                    # Shared primitives (Button/Input/Card/Modal/Text/etc.)
├── features/                  # Domain-first UI modules
│   ├── home/
│   │   ├── components/
│   │   └── screens/
│   ├── insights/
│   │   ├── components/
│   │   └── screens/
│   ├── onboarding/
│   │   └── screens/
│   ├── settings/
│   │   └── screens/
│   └── transactions/
│       ├── components/
│       │   └── editor/
│       └── screens/
├── constants/                 # App defaults, motion presets, design tokens
├── context/                   # App and theme providers
├── hooks/                     # Reusable cross-screen hooks
├── services/                  # Device/integration services (haptics/import/navigation events)
├── types/                     # Domain types only
├── utils/                     # Pure helpers/formatters/error utilities
└── lib/                       # Persistence and i18n internals
    ├── db/                    # SQLite + schema + migrations
    ├── i18n/                  # Localization setup and locale files
    └── repositories/          # Data access layer over Drizzle
```

## Architecture

- **Presentation layer**: feature screens/components live in `features/*`; shared UI lives in `components/*`.
- **State orchestration**: `context/AppContext.tsx` centralizes app state/actions.
- **Persistence layer**: `lib/repositories/*` over Drizzle + Expo SQLite.
- **Shared domain logic**: `utils/*`, `types/*`, `services/*`, `hooks/*`.
- **Theme system**: NativeWind + `constants/designSystem.ts` + `hooks/useThemeVars.ts`.

## Notes

- Local-first app: data is stored in SQLite on-device.
- Money Manager `.mmbak` import is available in onboarding setup flow.
- Bottom navigation tabs stay mounted for fast tab switching.
- `features/*` uses domain-first grouping to keep related components/screens close.
