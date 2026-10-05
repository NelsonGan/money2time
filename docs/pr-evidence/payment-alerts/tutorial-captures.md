# Payment alert tutorial captures

Captured on 5 October 2026 from the running apps, using Argent screenshots at
full device resolution. Red tap markers come from accessibility frames;
`scripts/data/autolog-shots.json` stores the reproducible annotation spec.
The 20 indexed PNGs under `assets/autolog/pa_*.png` illustrate 20 steps.

- iPhone 18 Pro, iOS 27.0: manually built a Notification automation in Shortcuts
  using the built-in Wallet app. Bound Notification Body, Title and Subtitle to
  Money2Time's Log Payment Alert action, with From set to Wallet and a selected
  account. The guide shows Automation on and Notify off. The test example was
  disabled after capture; no shortcut was manually run. The former SMS guide,
  route, translations and screenshots are removed.
- Android emulator, API 36: in-app disclosure, system notification access and
  permission confirmation, app selection, account picker and the synthetic
  setup test. Shell is the emulator's test source, mapped to Rewards Card.
  Money2Time's own notification permission was denied, so this run used the
  native test-queue fallback. The preview created no expense. Original app
  preferences, theme and notification access were restored after capture.
- The simulator and emulator windows remained open during testing. The final
  guide pages were checked in Money2Time on both platforms.

## Examples and verification limits

Wallet is a real installed iOS app; Shell is an Android emulator test source.
These examples teach setup and do not represent real payment delivery.
iOS Simulator has no App Store, and the Android emulator has no functioning
Play Store; neither had an installable Maybank build. These captures do not
verify Maybank delivery, bank login, a real purchase, iPhone automation firing
or manufacturer-specific Android background behavior.

App notification automations require iOS 27. Earlier iOS versions use the
existing Apple Pay or screenshot-sharing flows; there is no SMS fallback guide.

Tutorial images and captions add no analytics events, properties or triggers.
The remaining tutorial topics keep the existing screen tracking.

## Automation page verification

- iPhone 18 Pro and iPad mini (A17 Pro), iOS 27: checked the App notifications
  bell icon and explanation in light and dark themes. The card stays on
  Automation when tapped; the top-right Tutorial link opens page 1 of the
  App notifications guide directly. There is no iOS source-settings entry.
- Android API 36: confirmed Payment alerts still opens the capture switch,
  selected apps and Choose apps, with no tutorial button on the inner page.
- The screenshot comparison on iPhone showed changes in the notification
  section and the sections below it; the Apple Pay section above stayed the same.
  Payment-alert preferences stayed unchanged on all three devices, and original
  iOS themes were restored. These presentation changes do not test new payment
  delivery.

## Code review regression verification

- Android API 36: reran Choose apps and the native setup test with Malay selected.
  The localized alert previews RM1.00 / Rewards Card / Food. The native test
  capture was drained and no expense was created: 7,099 transactions before
  and after. Restored the original English locale, System theme and exact
  payment-alert preferences, then checked the Shell account screen's trash icon.
- iOS 27 iPad mini and Android API 36: evaluated the revised pipeline in the
  running app with synthetic inputs. Checked explicit iOS accounts against
  obsolete disabled source settings, unavailable accounts, Android's off switch,
  pre-authorization holds and KWD 1.250 parsing. These runtime checks did not
  save transactions or exercise a real notification-triggered iOS automation.
- Refreshed the iPad Automation and Android source screenshots and added the
  Malay test-result capture. The iPad preferences and Light theme stayed unchanged.
  Both device windows remained visible during testing and were left on the
  checked Automation/source screens.
