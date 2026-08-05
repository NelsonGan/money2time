# Subscription logos

Brand icons for recurring subscriptions (streaming, music, cloud, telco/ISP
bundles, delivery memberships, software), laid out exactly like
`assets/account-logos`: one folder per country slug, plus `global/` for the
services people subscribe to everywhere.

- Format: **256x256 PNG**, palette-quantized, same as every account logo.
- Source: Brandfetch (square app-icon variant per brand domain).
- Nothing imports these yet. They are bundled assets only; wiring them into a
  picker/registry is a separate change.

## Regenerating / extending

`scripts/fetch-subscription-logos.mjs` holds the researched catalog: for each
market, the subscriptions that actually show up on people's statements. Run it
with a Brandfetch key, then normalize:

```bash
BRANDFETCH_API_KEY=... node scripts/fetch-subscription-logos.mjs            # all countries
BRANDFETCH_API_KEY=... node scripts/fetch-subscription-logos.mjs japan india # just these
python3 scripts/normalize-subscription-logos.py                             # -> 256x256 PNG
```

The catalog in that script is deliberately larger than what is currently
committed here, so filling in the remaining countries is a matter of running it
rather than redoing the research.

## Four things to check after a fetch

1. **Placeholder icons.** The CDN (the `cdn.brandfetch.io/<domain>` route, which
   only needs the publishable client id) answers a missing brand with a generic
   dark "B" lettermark rather than a 404. Two brands coming back byte-identical
   is the tell:

   ```bash
   find assets/subscription-logos -name '*.png' | xargs sha256sum \
     | sort | awk '{print $1}' | uniq -d
   ```

   The authenticated Brand API does not do this, it returns a real error, so
   prefer that route when the key has quota.

2. **Parent-brand fallbacks.** Sub-brands on a shared domain resolve to the
   parent mark: `tv.apple.com` and `music.apple.com` both return the plain Apple
   logo, not the Apple TV+ / Apple Music icons. Those need a brand id rather than
   a domain.

3. **Icon type.** Some brands have no square `icon` but do have a `logo` or
   `symbol`. Falling back to those is usually right (the normalizer pads a wide
   mark onto a square canvas), which is how Tencent Video, Mango TV, NetEase
   Cloud Music, Kugou, Ximalaya and Xiaohongshu got covered.

4. **Not every icon is a mark.** A few brands publish key art as their icon.
   Xbox came back as a game-key-art tile and WPS as a mostly-empty crop, so both
   were dropped rather than committed. Eyeball a contact sheet before committing.

## Coverage

Chinese and Japanese services are the thinnest: Abema, TVer, FOD, d Anime Store,
Douyin, Ele.me and Amazon Japan have no Brandfetch record at all. See
`NOT_ON_BRANDFETCH` in the fetch script for the confirmed-missing list. Where a
market simply has fewer subscription brands than another, the folder is smaller
on purpose.
