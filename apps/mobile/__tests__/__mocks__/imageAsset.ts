// Metro resolves `require('*.png')` to an asset id; under Jest there is no asset
// registry, so image requires stand in as an opaque non-null value. Enough for
// registries (account logos, category icons) that only assert a source exists.
export default 1;
