# Album Globe & Map — Design & Implementation Plan

Status: **Planned** · Branch: `claude/album-globe-planning-zp3mqt`

This document describes how to add **two location views of albums** to money2time:

- A **3D globe** (the hero view) — a spinning Earth with each located album shown
  as a pin carrying its cover photo + total spend.
- A **flat map** (drill-down view) — a real, pannable/zoomable street-capable map
  for looking closely at a place, built on the open-source **MapLibre** stack
  (no API key).

The user attaches a real-world location (city / country) to each album; both
views render those albums as pins. Tapping a pin opens the album. Albums at the
same place stack into a swipeable card.

> **Update log**
> - v2 — Added the flat-map view via **MapLibre React Native** (open-source, no
>   API key). Clarified globe stays on Skia (fully offline, zero-dep). Adjusted
>   the "no new native deps" claim: the **globe** adds none; the **map** adds one
>   native module. See §2.2.

Hard requirements from the request:

1. **Globe is fully offline** — globe texture, the city database, and all
   geocoding ship inside the app bundle. No network calls for the globe, ever.
2. **City picker backed by a real place database** — e.g. pick "Tokyo, Japan".
   Sourced from an open dataset (GeoNames), bundled offline.
3. **Markers show the album photo + expense.** Multiple albums at one place
   stack / are swipeable.
4. **A floating button on the albums index** toggles location mode.
5. **Performant** — 60fps globe rotation, smooth map, fast cold start.
6. **Open-source map, no API key** — use MapLibre, not the token-gated Mapbox SDK.

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
  walked by the backup layer. We reuse these as the pin thumbnails — no new
  asset plumbing.
- **Stack already in the project**: `@shopify/react-native-skia` (2.2.12),
  `react-native-reanimated` (~4.1), `react-native-gesture-handler` (~2.28),
  `react-native-worklets`, `expo-image`, `expo-sqlite` (16), `drizzle-orm`,
  `react-native-pager-view`. The globe reuses these with **no new native module**;
  the map adds **one** (MapLibre — see §2.2).
- **Pro gating**: `useProGate()` + `PRO_LIMITS.FREE_MAX_ALBUMS`.

Implication: this feature is mostly **(a) add location columns + a city picker**,
**(b) a Skia globe surface**, and **(c) a MapLibre map surface**. The data model,
album CRUD, photo storage, and backup are largely done.

---

## 2. Rendering — globe (Skia) + map (MapLibre)

The two views answer different needs and use different engines on purpose:

| View | Engine | Offline | New native dep | Role |
|---|---|---|---|---|
| **Globe** | Skia + SkSL shader | Fully offline | None | Hero overview, "my trips on Earth" |
| **Map** | MapLibre React Native | Offline-first (bundled low-zoom tiles) + optional online detail | One module | Drill into a place, street-capable |

### 2.1 Globe — Skia with an SkSL runtime shader (recommended, unchanged)

Render the Earth as a **shaded sphere in a single Skia `Canvas`** via a runtime
(SkSL) fragment shader that ray-marches a sphere and samples a **bundled
equirectangular Earth texture**. Rotation/zoom come from Gesture Handler +
Reanimated shared values. Album pins are projected from lat/lng to screen space
**in JS/worklet**, back-face-culled, and drawn as Skia `Image`/`Circle` nodes on
top. Taps are hit-tested against the same projected positions.

Why Skia for the globe:

- **Zero new native modules** — Skia, Reanimated, Gesture Handler, Worklets are
  already dependencies.
- **GPU-fast** — one full-screen shader pass + a few dozen image draws at 60fps.
- **Fully offline by construction** — the texture is a bundled asset; the shader
  is a string. Nothing fetches.
- **On-brand** — can be a stylized, **theme-tinted** minimal globe (tinted to the
  user's `themeColor`) rather than a photoreal one, matching the design system.

Rejected for the globe: `@aeryflux/globe` (CDN-served models by default, no
lat/lng pin API), `react-globe.gl` / `react-globe` (web/DOM only), and
`expo-gl`+`three.js` (true 3D but adds native modules for no real gain here).

> Note: MapLibre Native has recently gained a **globe projection** too, so in
> principle one library could do both surfaces. We keep the Skia globe as primary
> because it is fully offline with zero deps and trivially theme-tintable; the
> MapLibre globe is a possible future unification, not the v1 path.

**Shader** (`features/albums/globe/earthShader.ts`): SkSL compiled once via
`Skia.RuntimeEffect.Make(...)`. Uniforms: `uResolution`, `uRotation` (yaw/pitch),
`uZoom`, `uLightDir`, `uTexture` (equirectangular image shader). Per fragment:
build a ray, intersect the unit sphere; on miss draw atmosphere/space; on hit
rotate the point by `uRotation`, convert to `(u,v) = (atan2(z,x), asin(y))`,
sample `uTexture`, apply Lambert shading + a rim/atmosphere term near the limb.

**Projection** (`features/albums/globe/projection.ts`, pure + unit-tested):
`latLngToVec3`, `project(vec3, rotation, zoom, viewport) -> { x, y, visible }`
(same rotation convention as the shader; `visible` = near hemisphere), and
`clusterByScreenDistance` for stacking. **Both shader and projection derive from
one shared `rotate` helper** so pins stay glued exactly to their coordinate — the
single most important correctness detail, covered by landmark tests (Tokyo, NYC,
London, and `(0,0)` in the Gulf of Guinea).

**Texture**: one equirectangular map, **2048×1024 WebP** (~200–400 KB), e.g. NASA
Blue Marble (public domain) for photoreal, or a stylized grayscale landmask we
tint to the theme. Stored at `assets/globe/earth-2k.webp`, loaded via Skia
`useImage()`.

**Perf budget**: shader-driven rotation off the JS thread (Reanimated shared
values), pre-decode pin thumbnails once and memoize, draw only **visible** pins,
recompute projections only past a rotation epsilon, inertial fling + idle
auto-spin that pauses on touch, clamped pitch/zoom, static fallback if `useImage`
returns null.

### 2.2 Map — MapLibre React Native (open-source, no API key)

Use **`@maplibre/maplibre-react-native`** — the community open-source fork of the
Mapbox SDK, **BSD-licensed, no token required**, vector tiles, smooth zoom to
street level, fully themeable styles.

> **Naming clarification.** The old `react-native-mapbox-gl` package is
> deprecated. It split into `@rnmapbox/maps` (requires a Mapbox account/token —
> avoid) and **`@maplibre/maplibre-react-native`** (no token, open-source — use
> this one). Same component API and visual style as Mapbox GL.

**Native-module reality.** MapLibre RN is a native module, so it needs an Expo
**config plugin** + a **dev-client / prebuild** (no Expo Go). This is compatible
with our pipeline — CI already does native EAS local builds in
`.github/workflows/deploy.yml` — but it is real build surface: add the plugin to
`app.json`, rebuild the dev client, and expect the first Android/iOS build after
adding it to take longer. Document this in `CLAUDE.md`.

**Offline strategy (no API key, network-optional).** This is the crux. Options,
in order of preference:

1. **Bundle a low-zoom world basemap as a static file (recommended).** Use a
   **Protomaps PMTiles** archive of a world/region basemap (built from OpenStreetMap,
   free, no key) covering low zooms (≈ z0–z6, tens of MB), shipped as an asset and
   read locally via the `pmtiles://` protocol. A single static file, no tile
   server, no key — gives a fully-offline overview/region map. *Verify current
   MapLibre **Native** PMTiles support for the installed version; if unavailable,
   fall back to a bundled **MBTiles** raster/vector pack read through a local file
   source.*
2. **Online detail when connected (optional enhancement).** Point the style at a
   free no-key online tile source (or the user's own) for street-level detail when
   the device is online; tiles cache after first load. This is *offline-first*:
   overview always works; detail loads when available.
3. **Offline packs** (MapLibre `OfflineManager`) — let the user download a region
   for offline use. Useful later; requires network once.

Default v1: **option 1** (bundled low-zoom PMTiles overview) so the map works with
no network, with **option 2** as a connected-only enhancement. This honors
"open-source, no key" and keeps the offline-first promise; only *street-level*
detail needs connectivity.

**Style & theming.** The map style is JSON. Start from a free no-key basemap
(Protomaps "basemaps", or the Made-with-MapLibre light/minimal/dark styles) and
**tint it to the active `themeColor`** so the map matches the globe and the rest
of the app. Light-minimal/dark read as the sleekest for a finance app.

**Album pins on the map.** Two render paths:

- `ShapeSource` (a GeoJSON `FeatureCollection` of located albums) + `SymbolLayer`
  with **`cluster: true`** → MapLibre handles co-location **clustering natively**
  (a cluster bubble with a count, expanding as you zoom). This is the performant
  default for many pins.
- For the album-photo look, `MarkerView` / `PointAnnotation` host a custom RN view
  (the cover thumbnail + expense pill) at a coordinate. Use these for the
  individual (unclustered) pins; tapping opens the album, tapping a cluster zooms
  in or opens the swipeable cluster sheet (§6).

So clustering is **native on the map** and **manual (screen-distance) on the
globe** (§6) — same UX, two mechanisms.

---

## 3. Offline place database — GeoNames, bundled as read-only SQLite

We need a searchable list of world cities → `{ name, admin1, countryCode,
countryName, lat, lng, population, timezone }`, fully offline.

**Source:** **GeoNames** `cities15000` (~26k cities of pop > 15,000 or capitals)
— the sweet spot for coverage vs. size. `cities5000` (~50k) is the fallback for
smaller towns; `cities500` (~200k) is overkill.

**Packaging:** prebuild a **read-only SQLite** at build time and bundle it as an
asset (the standard offline-geo pattern, cf. `geonames-sqlite`).

- **Build script** `scripts/build-cities-db.mjs`: downloads `cities15000.zip` +
  `countryInfo.txt` + `admin1CodesASCII.txt`, writes `assets/db/cities.db` with
  `cities`, `country_names`, `admin1_names`, an **FTS5** table `cities_fts` for
  diacritic-insensitive typeahead, and a `population DESC` index; `VACUUM`s to a
  single compact file. Expected size **~2–4 MB**. Run manually when refreshing
  data; the generated `.db` is committed as a build asset.

**Runtime** (`lib/db/citiesDb.ts`): a **second, read-only `expo-sqlite`
connection**, separate from `money2time.db`. On first launch, copy
`assets/db/cities.db` into `<documentDirectory>SQLite/cities.db` (guarded by a
version marker), open with `query_only = ON` + mmap. **Never** run the money2time
migration runner against it. API: `searchCities(query, limit)` (FTS5 prefix, ranked
by population, debounced in UI) and `getCityById(id)`. It is reference data —
excluded from backup and from `resetAllData`.

Why not JSON / npm geo packages: a 26k-row JSON is a multi-MB main-thread parse
with no FTS; npm packages either fetch at runtime or aren't RN-friendly. A bundled
`.db` keeps us fully offline and in control of size.

---

## 4. Data model changes

### Migration `037_album_location.ts`

Add nullable location columns to `albums` (nullable → existing albums unaffected;
"located" = `latitude IS NOT NULL`):

```sql
ALTER TABLE albums ADD COLUMN latitude REAL;
ALTER TABLE albums ADD COLUMN longitude REAL;
ALTER TABLE albums ADD COLUMN place_id TEXT;       -- GeoNames id, for re-resolve
ALTER TABLE albums ADD COLUMN place_name TEXT;     -- "Tokyo"
ALTER TABLE albums ADD COLUMN place_admin TEXT;    -- admin1, nullable
ALTER TABLE albums ADD COLUMN country_code TEXT;   -- "JP"
```

Follow the `ALTER TABLE … ADD COLUMN` style of `035`/`036`. Mirror the columns in
`albumsTable` + `AlbumRow` (`lib/db/schema.ts`).

### Type + mapper + repo + context

- `types/index.ts` → extend `Album` with the six nullable location fields; add
  `LocatedAlbum = Album & { latitude: number; longitude: number }` guard and an
  `AlbumLocation` helper type.
- `lib/repositories/mappers.ts` → `toAlbum` maps the new columns.
- `albumsRepository` `CreateAlbumInput`/`update` input → add location fields (the
  spread-based `update` persists them once typed).
- `context/AppContext.tsx` → `setAlbumLocation(id, location | null)` convenience +
  a memoized `locatedAlbums` selector + a memoized `albumsGeoJson` selector (the
  `FeatureCollection` the MapLibre `ShapeSource` consumes).

---

## 5. UX & screens

### 5.1 Setting a location (offline city picker)

In `EditAlbumDetailsScreen` (and optionally `CreateAlbumScreen`), add a
**"Location"** row → opens a new bottom-sheet **`CityPickerSheet`** (mirroring
`AccountPickerSheet`/`CategoryPickerSheet`): debounced search → `searchCities()`
→ FlashList of "City, Admin, Country" rows; selecting writes the six location
fields; a chip with "✕ clear" removes it. i18n empty/no-results copy.

### 5.2 Location mode toggle (albums index)

On `AlbumsScreen`, add a **floating action button** (bottom-right, above the
bottom-nav inset via `useBottomNavContentInset()`) with a globe/map icon
(`lucide-react-native` `Globe`/`Map`). It pushes a new root-stack screen
`AlbumLocations`. The top-right "+" stays for create. Register the screen in
`navigation/rootStack.ts` + `navigation/stackOptions.ts` (`headerShown: false`,
gesture-back), following the existing pattern.

### 5.3 The location screen — `features/albums/screens/AlbumLocationsScreen.tsx`

Hosts **both views with a segmented toggle** (Globe ⇄ Map) in the top bar:

- **Globe view** — the Skia `AlbumGlobeView` (§2.1): rotate/pinch/fling, idle
  auto-spin, photo pins with expense badges, taps open albums / cluster sheet.
- **Map view** — the MapLibre `AlbumMapView` (§2.2): `MapView` + `Camera`, the
  themed offline style, `ShapeSource`(cluster) + `MarkerView` photo pins, tap to
  open album / zoom cluster. A "fit all" button frames all located albums.
- Shared chrome: back chevron (consistent with `AlbumDetailScreen`), the
  Globe/Map toggle, and an empty state (mascot + "Add a location to an album to
  see it here") when no album has a location.

Both views read the same `locatedAlbums` / `albumsGeoJson` selectors and open the
same `AlbumDetailScreen` on pin tap — only the renderer differs.

### 5.4 Pin visual

Rounded-square cover thumbnail (~44px) with border + soft shadow, anchored by a
small dot/tail at the exact coordinate, and a pill badge below showing total spend
(`formatAmount`/`formatHours`, respecting display mode). Covers from
`getAlbumCoverUri`; fall back to the album initial (as `AlbumDetailScreen` does).
Same component drives globe (Skia draw) and map (`MarkerView` RN view).

---

## 6. Stacking co-located albums

- **Globe**: `clusterByScreenDistance` (radius ≈ pin width) groups co-located
  pins into one thumbnail with a count badge + stacked-cards shadow; recomputed
  only past a rotation/zoom epsilon.
- **Map**: native `ShapeSource` clustering (`cluster: true`) gives count bubbles
  that split as you zoom.

Tapping a multi-album cluster (either view) opens **`GlobeClusterSheet`** — a
bottom sheet hosting a `react-native-pager-view` (already a dep) of **swipeable**
album cards (cover + name + date range + total spend + "Open album"). Single-album
clusters open the album directly. This satisfies "stack or swipeable."

---

## 7. Pro gating decision

Albums are already limited by `PRO_LIMITS.FREE_MAX_ALBUMS = 3`. Recommendation:
**location mode (globe + map) is free** (it's a viewer over data the user already
created) and used as a Pro *showcase* in the paywall. If product wants it gated,
wrap the FAB with `useProGate()`/`checkLimit` + `ProPaywall` (both already exist).
Default **free** unless told otherwise.

---

## 8. i18n, analytics, backup, build

- **i18n**: `albums.location.*` / `albums.globe.*` / `albums.map.*` namespaces in
  `en.ts` + `zh.ts` (others fall back to English).
- **Analytics**: `AlbumLocationSet`, `AlbumLocationsOpened`, `LocationViewToggled`
  (globe/map), `GlobePinTapped`, `MapPinTapped`, `ClusterOpened`.
- **Backup**: cover photos already in `user-assets` backup; the new album columns
  ride along in album export (verify `dataManagementService` serializes full album
  rows — extend if it whitelists columns). `cities.db`, the Earth texture, and the
  PMTiles basemap are **reference assets, excluded** from backup/reset.
- **Build**: add MapLibre's Expo **config plugin** to `app.json`; ensure `.db`,
  `.pmtiles`/`.mbtiles`, and `.webp` are bundled (metro `assetExts` /
  `assetBundlePatterns`). Rebuild the dev client. Document in `CLAUDE.md`.

---

## 9. File-by-file change list

**New files**

- `lib/db/migrations/037_album_location.ts` — location columns.
- `lib/db/citiesDb.ts` — read-only cities DB, copy-on-first-run, `searchCities`,
  `getCityById`.
- `assets/db/cities.db` — prebuilt GeoNames cities15000.
- `assets/globe/earth-2k.webp` (+ optional 1k fallback) — Earth texture.
- `assets/map/basemap.pmtiles` (or `.mbtiles`) — bundled low-zoom offline basemap.
- `assets/map/style.json` — themeable MapLibre style (tinted at runtime).
- `scripts/build-cities-db.mjs` — generates `cities.db` from GeoNames.
- `features/albums/globe/earthShader.ts` — SkSL source + compiled effect.
- `features/albums/globe/projection.ts` — lat/lng→screen + clustering (pure).
- `features/albums/components/AlbumGlobeView.tsx` — Skia globe surface.
- `features/albums/components/AlbumMapView.tsx` — MapLibre map surface.
- `features/albums/components/GlobePin.tsx` — pin/cluster visual (shared).
- `features/albums/components/GlobeClusterSheet.tsx` — swipeable cluster cards.
- `features/albums/screens/AlbumLocationsScreen.tsx` — globe/map host screen.
- `components/ui/CityPickerSheet.tsx` — offline city search sheet.
- Tests: `__tests__/globeProjection.test.ts`, `__tests__/citiesDb.test.ts`,
  `__tests__/albumLocation.repository.test.ts`.

**Edited files**

- `lib/db/schema.ts` — `albumsTable` + `AlbumRow` location columns.
- `types/index.ts` — `Album` + `LocatedAlbum`/`AlbumLocation`.
- `lib/repositories/mappers.ts` — `toAlbum`.
- `lib/repositories/albumsRepository.ts` — `CreateAlbumInput` location fields.
- `context/AppContext.tsx` — `setAlbumLocation`, `locatedAlbums`, `albumsGeoJson`.
- `navigation/rootStack.ts`, `navigation/stackOptions.ts` — register
  `AlbumLocations`.
- `features/albums/screens/AlbumsScreen.tsx` — location FAB.
- `features/albums/screens/EditAlbumDetailsScreen.tsx` (+ maybe `CreateAlbumScreen`)
  — Location row + `CityPickerSheet`.
- `features/albums/screens/index.ts` — export new screen.
- `lib/i18n/locales/en.ts`, `zh.ts` — strings.
- `services/analytics.shared.ts` — new events.
- `app.json` — MapLibre config plugin + asset bundling.
- `package.json` — add `@maplibre/maplibre-react-native` (+ `pmtiles` protocol
  helper if needed).
- `CLAUDE.md` — document the feature, the cities-DB build script, the
  "never migrate cities.db" rule, and the MapLibre dev-client requirement.

---

## 10. Phased delivery

1. **Phase 1 — Location data & city picker (no views yet).** Migration 037;
   schema/type/mapper/repo/context; `citiesDb` + `build-cities-db.mjs` + bundled
   `cities.db`; `CityPickerSheet`; Location row in album editing. Ships value
   immediately (albums gain a searchable, offline place). Tests: cities search +
   repository.

2. **Phase 2 — Globe (fully offline, zero-dep).** `earthShader` + `projection` +
   `AlbumGlobeView` + `AlbumLocationsScreen` (globe only) + FAB + nav. Bundled
   Earth texture, theme tinting. Projection landmark unit tests + Argent QA
   (glued pins, back-face culling, 60fps).

3. **Phase 3 — Map (MapLibre).** Add `@maplibre/maplibre-react-native` + config
   plugin + dev-client rebuild; bundled offline PMTiles basemap + themed style;
   `AlbumMapView` with clustered `ShapeSource` + photo `MarkerView`; Globe/Map
   toggle. QA the offline overview + online detail paths.

4. **Phase 4 — Stacking, polish, gating.** `GlobeClusterSheet` swipe (both views);
   expense badges + time/money display; inertial spin + idle auto-spin; empty/
   fallback states; analytics; i18n completion; Pro decision. Screenshot-diff QA.

Each phase keeps `npm run check && npm test` green (CI `test` gate).

---

## 11. Open questions for sign-off

1. **Map offline depth** — bundle a **low-zoom world** PMTiles overview only
   (small, fully offline), or also pre-bundle one or two **regions at higher zoom**
   (bigger, but offline street detail where the user travels most)?
2. **Globe art direction** — **theme-tinted minimal** (recommended, on-brand) vs.
   photoreal Blue Marble.
3. **Pro gating** — location mode free (recommended) vs. Pro-gated.
4. **City coverage** — `cities15000` (~26k, ~2–4 MB; recommended) vs. `cities5000`
   (~50k) for smaller towns.
5. **Per-transaction locations later?** Out of scope for v1 (album-level matches
   the request); schema leaves room for `transactions.latitude/longitude` if
   "expenses on a map" becomes its own feature.

---

## Sources

- MapLibre React Native (open-source, no key):
  <https://github.com/maplibre/maplibre-react-native>,
  <https://maplibre.org/maplibre-react-native/docs/setup/expo/>
- No-key basemaps / styles: <https://madewithmaplibre.com/basemaps/gallery/>,
  Protomaps / PMTiles <https://docs.protomaps.com/>
- rnmapbox (token-gated alternative, for API reference):
  <https://rnmapbox.github.io/>
- Skia for RN graphics: <https://docs.expo.dev/versions/latest/sdk/skia/>,
  <https://shopify.engineering/webgpu-skia-web-graphics>
- Offline city data: <https://www.geonames.org/export/>,
  <https://github.com/mjradwin/geonames-sqlite>
- Earth texture (public domain): NASA Blue Marble / Visible Earth.
</content>
