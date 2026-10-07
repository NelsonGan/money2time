# Money2Time public tutorial media

The `money2time-assets` R2 bucket serves published tutorial media at
`https://media.money2time.com`. It belongs to the same Cloudflare account and
`money2time.com` zone as the app's Workers. The custom domain is enabled with
minimum TLS 1.2; the development `r2.dev` URL stays disabled.

This bucket contains public app assets. User data and backups belong elsewhere.
The app opens videos through the top-right video link in each automation
tutorial, using the URLs in `constants/autoLogIntents.ts`. Notifications uses
the same **Watch video** button as the other automation tutorials.

## Published video

- Object: `tutorials/ios/notifications/setup-2026-10-07.mp4`
- URL: <https://media.money2time.com/tutorials/ios/notifications/setup-2026-10-07.mp4>
- Recording: iPhone 18 Pro simulator, iOS 27, real Shortcuts editor with Wallet
  and synthetic Money2Time accounts, recorded after the feature was renamed to
  Notifications. The Log Notification action binds Message to Notification Body
  and selects Account. Includes instructional captions and Argent touch markers.
- Editing: idle time removed per step, then played at 2.5x with a short hold on
  each caption, so the whole setup runs in about 32 seconds (the previous 2x cut
  ran 54 seconds).
- Encoding: H.264 MP4, 900 × 2120, approximately 32 seconds.
- Size: 2,610,503 bytes.
- SHA-256: `3de482a147d2a9dd4ac8fa1897f96a950367484b9efe5e2caa292aeee3c4da5e`.
- Local file: `Money2Time-iOS-Notifications-Setup-2026-10-07.mp4` in Downloads.

Earlier versions stay in the bucket and are no longer linked:
`tutorials/ios/app-notifications/setup-2026-10-05.mp4` (1x) and
`setup-2026-10-05-2x.mp4` (2x), both showing the old Log Payment Alert name.

## Upload a new version

Use a new dated object key when a tutorial changes, then update its URL in
`constants/autoLogIntents.ts`. Existing versions use a one-year immutable cache
header and must not be overwritten. The local recording remains in Downloads;
videos are not bundled into the app or committed to Git.

From the repository root, using the existing Wrangler installation and login:

```bash
cloudflare/workers/receipt-scanner/node_modules/.bin/wrangler r2 object put \
  money2time-assets/tutorials/ios/notifications/setup-2026-10-07.mp4 \
  --remote \
  --file "$HOME/Downloads/Money2Time-iOS-Notifications-Setup-2026-10-07.mp4" \
  --content-type video/mp4 \
  --content-disposition inline \
  --cache-control 'public, max-age=31536000, immutable'
```

After uploading, verify that the public URL returns the expected MP4, that a
byte-range request returns `206 Partial Content`, and that the tutorial's Video
link opens and plays it on iOS. Record the new object's size, hash and verification
evidence here. No Worker deployment or app native rebuild is required.
