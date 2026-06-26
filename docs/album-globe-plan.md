# Album Globe — Design & Implementation Plan

Status: **Planned** · Branch: `claude/album-globe-planning-zp3mqt`

This document describes how to add a **3D globe view of albums** to money2time.
The user attaches a real-world location (city / country) to each album, and a
new "globe mode" renders every located album as a pin on a spinning Earth. The
pin shows the album's cover photo and total spend; tapping it opens the album.
Albums at the same place stack into a swipeable card.

Hard requirements from the request:

1. **Fully offline** — globe textures, the city database, and all geocoding ship
   inside the app bundle. No network calls, ever.
2. **City picker backed by a real place database** — e.g. pick "Tokyo, Japan".
   Sourced from an open dataset, bundled offline.
3. **Globe markers show the album photo + expense.** Multiple albums at one place
   stack / are swipeable.
4. **A floating button on the albums index** toggles globe mode.
5. **Performant** — 60fps rotation, no jank, fast cold start.

---

## 1. What already exists (so we build with the grain)

The album feature is already shipped and is the right foundation:

- **Schema** (`lib/db/schema.ts`): `albumsTable` (`id, name, coverPhotoUri,
  isActive, startDate, endDate, sortOrder, …`) and `albumTransactionsTable`
  (join to transactions). Migrations live in `lib/db/migrations/NNN_*.ts`, are
  auto-discovered by `require.context`, and are gated by `PRAGMA user_version`.
  Latest is `036_albums_dates`. **Next free version is `037`.**
- **Repository** (`lib/repositories/albumsRepository.ts`): `list`, `getById`,
  `create`, `update`, `reorder`, `setActive`, `getStatRows`, etc. `update()`
  already accepts a partial input and stamps `updatedAt` — new location columns
  flow through it for free once added to the input type.
- **Type** (`types/index.ts`): `Album`, `AlbumStats`, `AlbumWithStats`. Mapper
  `toAlbum` in `lib/repositories/mappers.ts`.
- **Context** (`context/AppContext.tsx`): `albums`, `activeAlbumId`,
  `setActiveAlbum`, `reorderAlbums`, `getAlbumStats`, `getAlbumTransactions`,
  `createAlbum`, `updateAlbum`, `deleteAlbum`, `addTransactionsToAlbum`, etc.
- **Screens** (`features/albums/screens/`): `AlbumsScreen` (index grid, top-right
  "+" create button, active-album selector), `AlbumDetailScreen` (cover hero +
  breakdown/transactions pager), `CreateAlbumScreen`, `EditAlbumDetailsScreen`.
- **Cover photos** (`services/userAssets.ts`): `saveAlbumCover` /
  `getAlbumCoverUri` / `deleteAlbumCover` store images under
  `<documentDirectory>/user-assets/album-covers/<id>.<ext>` and are already
  walked by the backup layer. We reuse these as the globe pin thumbnails — no new
  asset plumbing.
- **Stack already in the project we can lean on**: `@shopify/react-native-skia`
  (2.2.12), `react-native-reanimated` (~4.1), `react-native-gesture-handler`
  (~2.28), `react-native-worklets`, `expo-image`, `expo-sqlite` (16),
  `drizzle-orm`, `react-native-pager-view`. **No new native module is required
  for the recommended approach.**
- **Pro gating**: `useProGate()` + `PRO_LIMITS.FREE_MAX_ALBUMS`. Globe mode can
  be a Pro perk or free — decision below.

Implication: this feature is mostly **(a) add location columns + a city picker**
and **(b) add a new globe render surface + a globe screen**. The data model,
album CRUD, photo storage, and backup are largely done.

---

## 2. Rendering the globe — library research & recommendation

This is the highest-risk decision, so it gets the most depth. Constraints:
offline, performant, can pin arbitrary lat/lng with a custom image + label,
hit-testable taps.

### Options evaluated

| Approach | 3D? | New native deps | Offline | Custom image pins | Verdict |
|---|---|---|---|---|---|
| **Skia + SkSL sphere shader** (recommended) | Faux-3D (shaded sphere) | **None** (Skia already in app) | Yes (bundled texture) | Yes (Skia images, JS-projected) | ✅ Best fit |
| `expo-gl` + `three.js` / `expo-three` | True 3D mesh | `expo-gl`, `expo-three` (+ dev-client rebuild) | Yes | Yes (sprites + raycast) | Viable but heavier |
| `@aeryflux/globe` (`/react-native`) | True 3D (three) | `expo-gl`, `expo-three` | **No** — models load from jsDelivr CDN by default; no documented lat/lng pin API | Limited | ❌ Rejected |
| `react-globe.gl` / `react-globe` | True 3D | WebGL/DOM | n/a | Yes | ❌ Web only (needs DOM/WebGL canvas) |

`@aeryflux/globe` looks attractive (it advertises an Expo entry point) but its
models are CDN-served by default and it exposes country/city *highlight* data,
not an arbitrary lat/lng pin-with-image API — both disqualifiers for our use
case. `react-globe.gl` and `react-globe` are DOM/WebGL components for the web.

### Recommendation: **Skia globe with an SkSL runtime shader**

Render the Earth as a **shaded sphere in a single Skia `Canvas`**, using a Skia
runtime (SkSL) fragment shader that ray-marches a sphere and samples a **bundled
equirectangular Earth texture**. Rotation/zoom come from Gesture Handler +
Reanimated shared values. Album pins are projected from lat/lng to screen space
**in JS/worklet**, back-face-culled, and drawn as Skia `Image`/`Circle` nodes on
top. Taps are hit-tested against the same projected positions.

Why this is the right call for *this* app:

- **Zero new native modules.** Skia, Reanimated, Gesture Handler, and Worklets
  are already dependencies. No `expo-gl`/`expo-three`, no dev-client rebuild
  churn, no extra app-size from a second graphics runtime. This matters: the CI
  in `.github/workflows/deploy.yml` builds locally with EAS and every native dep
  added is build risk.
- **GPU-fast.** Skia runs in C++ over JSI; the shader runs on the GPU. A single
  full-screen shader pass for the sphere + a few dozen image draws is trivial for
  Skia at 60fps.
- **Fully offline by construction.** The texture is an asset in the bundle; the
  shader is a string. Nothing fetches.
- **Matches house style.** The codebase already commits to Skia for custom
  drawing; reviewers and future maintainers stay on familiar ground.

Trade-off vs. true 3D (three.js): we get a *single shaded globe* (one sphere,
atmosphere halo, day texture, optional night/normal map in-shader) rather than a
full 3D scene graph. For "show my trips on a turning Earth" that is exactly
enough, and it is dramatically cheaper. If we later want true 3D extruded arcs
between trips, we revisit `expo-gl` then — the data model below doesn't change.

### The shader, concretely

`features/albums/globe/earthShader.ts` exports an SkSL source string compiled
once via `Skia.RuntimeEffect.Make(...)`. Uniforms:

- `uResolution` (vec2), `uRotation` (vec2 — yaw/pitch driven by gestures),
  `uZoom` (float), `uLightDir` (vec3), `uTexture` (shader — the equirectangular
  image via `image.makeShaderOptions(...)` / `ImageShader`).

Per-fragment logic: build a ray from the fragment, intersect the unit sphere; on
miss, draw the atmosphere/space gradient; on hit, rotate the hit point by
`uRotation`, convert the sphere point to `(u,v) = (atan2(z,x), asin(y))`
equirectangular coords, sample `uTexture`, apply Lambert shading from
`uLightDir`, and a rim/atmosphere term near the limb. This yields a convincing
lit Earth with day texture in one pass.

### Projecting pins (the JS/worklet side)

`features/albums/globe/projection.ts` — pure, unit-tested math:

- `latLngToVec3(lat, lng) -> {x,y,z}` (unit sphere).
- `project(vec3, rotation, zoom, viewport) -> { x, y, visible }` applies the same
  rotation as the shader, returns screen coords and a `visible` flag (true when
  the point's rotated `z` faces the camera — i.e. on the near hemisphere). This
  keeps pins glued to the surface and hidden when they rotate to the back.
- `clusterByScreenDistance(points, radiusPx)` groups pins whose projected
  positions are within `radiusPx` so co-located albums stack (see §6).

The projection constants must exactly mirror the shader's rotation convention;
both are derived from one shared `rotateY/rotateX` helper to avoid drift. This is
the single most important correctness detail and gets dedicated tests.

### Assets & sizing

- **Earth texture**: bundle one equirectangular day map. Use a **2048×1024 WebP**
  (~200–400 KB) as the default; optionally a 1024×512 fallback for low-RAM
  devices. Source: NASA Blue Marble (public domain). Store under
  `assets/globe/earth-day-2k.webp`, referenced via `require(...)` and loaded with
  `useImage()` from Skia. Public-domain source means no attribution/licensing
  blocker.
- Optionally a subtle **night-lights** or **normal/specular** map later; v1 ships
  day-only to keep the bundle lean.

### Performance budget & safeguards

- One shader pass + N small image draws (N = located albums, realistically < 100).
- Pin thumbnails: render album covers through `expo-image`'s cache or pre-decode
  to Skia images **once** and memoize; never decode per frame. Draw covers as
  small rounded rects (e.g. 44px) only for **visible** pins; off-hemisphere pins
  are skipped entirely.
- Drive `uRotation`/`uZoom` from Reanimated shared values so gestures never cross
  the JS bridge per frame. A momentum/inertia decay on fling, plus a slow idle
  auto-spin that pauses on touch.
- Clamp pitch to avoid pole flipping; clamp zoom.
- Cap pin redraws by only recomputing projections when rotation actually changes
  beyond a small epsilon.
- Provide a static fallback (flat map image + tappable list) if `useImage`
  returns null or the device reports no GPU — defensive, rarely hit.

---

## 3. Offline place database — research & recommendation

We need a searchable list of world cities → `{ name, admin1 (state/region),
countryCode, countryName, lat, lng, population, timezone }`, fully offline.

### Source

**GeoNames** (creativecommons, free). The `cities15000` extract (~26k cities of
population > 15,000 or capitals) is the sweet spot: covers essentially every
place a user would tag a trip with, while staying small. `cities5000` (~50k) is a
fallback if coverage feels thin; `cities500` (~200k) is overkill and bloats the
bundle. Recommendation: **start with `cities15000`.**

### Packaging: a prebuilt read-only SQLite asset

Rather than ship raw TSV and import at runtime, **prebuild a read-only SQLite
database at build time** and bundle it as an asset. This is the standard
offline-geo pattern (cf. `geonames-sqlite`).

- **Build script** `scripts/build-cities-db.mjs`: downloads `cities15000.zip`
  from GeoNames, parses the TSV, writes `assets/db/cities.db` with:
  - `cities(id, name, asciiName, admin1Code, countryCode, lat, lng, population,
    timezone)`
  - `country_names(countryCode, name)` (from GeoNames `countryInfo.txt`)
  - optional `admin1_names(code, name)` (from `admin1CodesASCII.txt`) so we can
    show "Tokyo, **Tokyo**, Japan".
  - An **FTS5** virtual table `cities_fts(name, asciiName)` for fast diacritic-
    insensitive typeahead, plus a `population DESC` index for ranking.
  - Run `VACUUM` + `PRAGMA journal_mode=DELETE` so the shipped file is a single
    compact, read-only artifact. Expected size **~2–4 MB** for cities15000.
- The script is documented in `CLAUDE.md`/README and run manually when refreshing
  data (not on every CI run). The generated `.db` is committed (or fetched as a
  build asset) so contributors don't need network at build time.

### Runtime access

`lib/db/citiesDb.ts` — a **second, read-only `expo-sqlite` connection**, separate
from `money2time.db`:

- On first launch, copy `assets/db/cities.db` from the bundle into
  `<documentDirectory>SQLite/cities.db` (expo-sqlite can only open DBs from its
  own directory). Use `expo-asset` + `expo-file-system` to copy once; guard with
  a version marker so we re-copy when the bundled DB updates.
- Open with `openDatabaseSync('cities.db')`; apply read-only-friendly pragmas
  (`query_only = ON`, `mmap_size`, `temp_store = MEMORY`). **Never** run the
  money2time migration runner against it.
- API:
  - `searchCities(query, limit = 25): CityResult[]` — FTS5 prefix match, ranked
    by `population DESC`. Debounced in the UI.
  - `getCityById(id): CityResult | null` — to re-resolve a saved place.

This keeps the user's writable app DB and the static reference DB cleanly
separated (different lifecycles, backup rules, and reset semantics — the cities
DB is never touched by `resetAllData`).

### Why not a JSON file / npm geo package?

A 26k-row JSON would be a multi-MB parse on the JS thread at startup (jank) and
can't do FTS. SQLite+FTS5 gives instant, memory-light prefix search and lazy
loading. npm geo packages (`@hebcal/geo-sqlite`, etc.) either pull data at
runtime or aren't RN-friendly; building our own bundled `.db` keeps us fully
offline and in control of size.

---

## 4. Data model changes

### Migration `037_album_location.ts`

Add nullable location columns to `albums` (nullable so existing albums are
unaffected and "located" is simply "latitude IS NOT NULL"):

```sql
ALTER TABLE albums ADD COLUMN latitude REAL;
ALTER TABLE albums ADD COLUMN longitude REAL;
ALTER TABLE albums ADD COLUMN place_id TEXT;       -- GeoNames id, for re-resolve
ALTER TABLE albums ADD COLUMN place_name TEXT;     -- "Tokyo"
ALTER TABLE albums ADD COLUMN place_admin TEXT;    -- "Tokyo" (admin1), nullable
ALTER TABLE albums ADD COLUMN country_code TEXT;   -- "JP"
```

Follow the existing `ALTER TABLE … ADD COLUMN` migration style (see
`035_albums_active` / `036_albums_dates`). Mirror columns in
`lib/db/schema.ts` (`albumsTable`), add to `AlbumRow`, and to the
`resetSchemaToBaseline` drop list ordering only if needed (no — albums already
listed).

### Type + mapper

- `types/index.ts` → extend `Album` with `latitude/longitude/placeId/placeName/
  placeAdmin/countryCode` (all nullable). Add a small `AlbumLocation` helper type
  and a `LocatedAlbum = Album & { latitude: number; longitude: number }` guard.
- `lib/repositories/mappers.ts` → `toAlbum` maps the new columns.
- `albumsRepository.CreateAlbumInput` / `update` input → add the location fields
  (the existing spread-based `update` already persists them once typed).

### Context

- `updateAlbum` already forwards partial updates → setting a location is
  `updateAlbum(id, { latitude, longitude, placeId, placeName, placeAdmin,
  countryCode })`. No new context method strictly required, but add a typed
  convenience `setAlbumLocation(id, location | null)` for clarity and to centralize
  the "clear location" path.
- Expose a memoized `locatedAlbums` selector (albums with non-null lat/lng) so the
  globe screen doesn't re-filter on every render.

---

## 5. UX & screens

### 5.1 Setting a location (city picker)

In **`EditAlbumDetailsScreen`** (and optionally `CreateAlbumScreen`), add a
**"Location"** row. Tapping it opens a new bottom-sheet **`CityPickerSheet`**
(mirror the existing `AccountPickerSheet`/`CategoryPickerSheet` patterns in
`components/ui/`):

- A search `TextInput` (debounced ~200ms) → `searchCities(query)` → FlashList of
  results showing "City, Admin, Country" with a small flag/emoji.
- Selecting a city writes the six location fields to the album and shows a chip
  with a "✕ clear" affordance.
- Empty state / "no results" copy via i18n.

This satisfies "select the location/city … from an online database, made fully
offline": the data originated from GeoNames online but ships in-app.

### 5.2 Globe mode toggle (albums index)

On **`AlbumsScreen`**, add a **floating action button** (bottom-right, above the
bottom nav inset using `useBottomNavContentInset()`) with a globe icon
(`lucide-react-native` `Globe`/`Earth`). It pushes a new root-stack screen
`AlbumGlobe`. The existing top-right "+" stays for create. The FAB is only shown
when at least one album has a location (otherwise show a one-time hint on first
located album, or always show and let the globe present its own empty state).

Register `AlbumGlobe` in `navigation/rootStack.ts` and `navigation/
stackOptions.ts` (full-screen modal/push, gesture-back enabled, `headerShown:
false`) following the existing root-screen registration pattern.

### 5.3 The globe screen — `features/albums/screens/AlbumGlobeScreen.tsx`

Layout:

- Full-bleed `Canvas` (Skia) background rendering the shaded Earth.
- Gesture overlay (`GestureDetector`): pan = rotate, pinch = zoom, fling =
  inertial spin; double-tap = zoom-to-fit / reset. Idle auto-spin.
- Pins layer: for each **visible** located album, a tappable cover thumbnail with
  a small expense badge (total spend from `getAlbumStats`, formatted with
  `formatAmount` / `formatHours` respecting display mode). Use the project's time
  vs. money display convention.
- Top bar: back chevron (consistent with `AlbumDetailScreen`), title, and a
  "list" toggle to fall back to the grid.
- Empty state when no album has a location: mascot + "Add a location to an album
  to see it here," with a button into album editing.

Tapping a pin → open `AlbumDetailScreen` for that album (reuse existing nav).

### 5.4 Pin visual

A rounded-square cover thumbnail (~44px) with a subtle border + drop shadow,
anchored by a small triangular "tail"/dot at the exact surface point, and a pill
badge beneath showing the total spend. Covers come from `getAlbumCoverUri`; fall
back to the album initial (same fallback `AlbumDetailScreen` already uses).

---

## 6. Stacking co-located albums

Multiple albums near the same screen point (`clusterByScreenDistance`,
radius ≈ pin width) form a **cluster**:

- Render the cluster as a single thumbnail with a **count badge** (e.g. "3") and a
  slight "stacked cards" shadow offset.
- Tapping a cluster opens a **`GlobeClusterSheet`** — a bottom sheet hosting a
  `react-native-pager-view` (already a dep) of album cards, **swipeable**
  left/right, each card showing cover + name + date range + total spend, with an
  "Open album" CTA. This directly satisfies "if multiple at same location, make it
  stack or swipeable."
- Single-album "clusters" skip the sheet and open the album directly.

Clustering runs in a worklet/memo keyed on rotation+zoom, recomputed only when
the view actually changes beyond an epsilon (perf safeguard from §2).

---

## 7. Pro gating decision

Albums themselves are already limited by `PRO_LIMITS.FREE_MAX_ALBUMS = 3`.
Recommendation: **globe mode is free** (it's a viewer over data the user already
created) to drive engagement, but treat it as a natural Pro showcase in the
paywall (`features/news` already has an album showcase). If we want it Pro-gated,
wrap the FAB with `useProGate()` and a `checkLimit`/paywall push — the hook and
`ProPaywall` screen already exist. Flag this for product sign-off; default to
**free** unless told otherwise.

---

## 8. i18n, analytics, backup

- **i18n**: add an `albums.globe.*` / `albums.location.*` namespace to
  `lib/i18n/locales/en.ts` (and `zh.ts`); other locales fall back to English per
  existing setup. Keys: title, FAB label, empty states, city-picker placeholder,
  "no results", cluster "open album", clear-location, etc.
- **Analytics**: `trackEvent` for `AlbumGlobeOpened`, `AlbumLocationSet`,
  `GlobePinTapped`, `GlobeClusterOpened` (extend `AnalyticsEvents`).
- **Backup**: cover photos already covered by `user-assets` backup. The new album
  columns ride along in the existing album backup/export (verify
  `dataManagementService` serializes full album rows — extend if it whitelists
  columns). The **cities.db is reference data, not user data** → explicitly
  excluded from backup/reset (it's outside `user-assets` and the writable DB).

---

## 9. File-by-file change list

**New files**

- `lib/db/migrations/037_album_location.ts` — location columns.
- `lib/db/citiesDb.ts` — read-only cities DB connection, copy-on-first-run,
  `searchCities`, `getCityById`.
- `assets/db/cities.db` — prebuilt GeoNames cities15000 (build artifact).
- `assets/globe/earth-day-2k.webp` (+ optional 1k fallback) — Earth texture.
- `scripts/build-cities-db.mjs` — generates `cities.db` from GeoNames dumps.
- `features/albums/globe/earthShader.ts` — SkSL source + compiled effect.
- `features/albums/globe/projection.ts` — lat/lng→screen math + clustering (pure).
- `features/albums/screens/AlbumGlobeScreen.tsx` — the globe screen.
- `features/albums/components/GlobePin.tsx` — pin/cluster Skia node.
- `features/albums/components/GlobeClusterSheet.tsx` — swipeable cluster cards.
- `components/ui/CityPickerSheet.tsx` — offline city search sheet.
- `__tests__/globeProjection.test.ts`, `__tests__/citiesDb.test.ts` (mock sqlite),
  `__tests__/albumLocation.repository.test.ts`.

**Edited files**

- `lib/db/schema.ts` — `albumsTable` + `AlbumRow` location columns.
- `types/index.ts` — `Album` + `LocatedAlbum`/`AlbumLocation`.
- `lib/repositories/mappers.ts` — `toAlbum` maps new columns.
- `lib/repositories/albumsRepository.ts` — `CreateAlbumInput` location fields.
- `context/AppContext.tsx` — `setAlbumLocation`, `locatedAlbums` selector.
- `navigation/rootStack.ts`, `navigation/stackOptions.ts` — register `AlbumGlobe`.
- `features/albums/screens/AlbumsScreen.tsx` — globe FAB.
- `features/albums/screens/EditAlbumDetailsScreen.tsx` (and/or `CreateAlbumScreen`)
  — Location row + `CityPickerSheet`.
- `features/albums/screens/index.ts` — export new screen.
- `lib/i18n/locales/en.ts`, `zh.ts` — strings.
- `services/analytics.shared.ts` — new events.
- `app.json`/metro asset config — ensure `.db` is bundled as an asset (add `db`
  to `assetBundlePatterns` / metro `assetExts` if needed).
- `CLAUDE.md` — document the globe feature, the cities DB build script, and the
  "never migrate cities.db" rule.

---

## 10. Phased delivery

1. **Phase 1 — Location data & city picker (no globe yet).**
   Migration 037, schema/type/mapper/repo, `citiesDb` + `build-cities-db.mjs` +
   bundled `cities.db`, `CityPickerSheet`, Location row in album editing. Ship
   value immediately (albums gain a place; searchable, offline). Tests: projection
   not needed yet; cities search + repository tests.

2. **Phase 2 — The globe surface.**
   `earthShader` + `projection` + `AlbumGlobeScreen` with rotate/zoom/pins,
   bundled Earth texture, FAB on the index, nav registration. Projection unit
   tests + manual QA via Argent on simulator/emulator (rotation glued pins,
   back-face culling, 60fps).

3. **Phase 3 — Stacking, polish, gating.**
   Clustering + `GlobeClusterSheet` swipe, expense badges + time/money display,
   inertial spin + idle auto-spin, empty/fallback states, analytics, i18n
   completion, Pro decision wiring. Screenshot-diff QA.

Each phase keeps `npm run check && npm test` green (the CI `test` job gate).

---

## 11. Open questions for sign-off

1. **Location granularity** — city only (recommended), or also allow
   country-only / custom dropped pin? City-only keeps the picker simple.
2. **Pro gating** — globe free (recommended) vs. Pro-gated.
3. **City coverage** — `cities15000` (~26k, ~2–4 MB; recommended) vs. `cities5000`
   (~50k) for smaller towns, trading bundle size.
4. **Per-transaction locations later?** Out of scope for v1 (album-level matches
   the request), but the schema leaves room to add `transactions.latitude/longitude`
   if "expenses on a map" becomes its own feature.

---

## Sources

- Skia for RN graphics / performance: <https://shopify.engineering/webgpu-skia-web-graphics>,
  <https://docs.expo.dev/versions/latest/sdk/skia/>
- Globe libraries surveyed: <https://github.com/aeryflux/globe>,
  <https://github.com/vasturiano/react-globe.gl>
- Offline city data: <https://www.geonames.org/export/>,
  <https://github.com/mjradwin/geonames-sqlite>
- Earth texture (public domain): NASA Blue Marble / Visible Earth.
</content>
</invoke>
