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

## Two things to check after a fetch

1. **Placeholder icons.** When Brandfetch has no icon for a domain, the CDN
   returns a generic dark "B" lettermark instead of a 404. Two different brands
   coming back byte-identical is the tell:

   ```bash
   find assets/subscription-logos -name '*.png' | xargs sha256sum \
     | sort | awk '{print $1}' | uniq -d
   ```

   Delete those and find the brand's real domain (`brand_search`) before
   retrying. `sonyliv.com` and `abema.tv` both hit this.

2. **Parent-brand fallbacks.** Sub-brands on a shared domain resolve to the
   parent mark: `tv.apple.com` and `music.apple.com` both return the plain Apple
   logo, not the Apple TV+ / Apple Music icons. Those need a brand id rather than
   a domain.
