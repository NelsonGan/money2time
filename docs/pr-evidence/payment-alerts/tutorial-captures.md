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
