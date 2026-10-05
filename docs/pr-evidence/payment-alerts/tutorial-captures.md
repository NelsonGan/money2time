# Payment alert tutorial captures

Captured on 5 October 2026 from the running apps, using Argent screenshots at
full device resolution. Red tap markers come from accessibility frames;
`scripts/data/autolog-shots.json` stores the reproducible annotation spec.
The 18 indexed PNGs under `assets/autolog/pa_*.png` illustrate 10 iOS steps and
8 Android steps.

- iPhone 18 Pro, iOS 27.0: manually built a Notification automation in Shortcuts
  using the built-in Wallet app. The simplified guide binds only Notification
  Body to Message and selects Account. The action has no From field; Title,
  Subtitle and Category are empty. Categories use the existing keyword matcher.
  Recaptured the five action-configuration frames after removing From and moving
  Account above the optional metadata. The guide shows Automation on and Notify
  off. The test example was disabled after capture; no shortcut was manually run.
  The former SMS guide, route, translations and screenshots are removed.
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

## Simplified iOS setup verification

- Walked all 10 App notifications guide pages on iPhone 18 Pro, iOS 27, through
  local Metro. Checked captions, images, tap markers and the final Done button.
  Refreshed the Body-selection PR screenshot and added account-selection and
  completed-setup screenshots. The visible simulator stayed on page 10.
- The running app accepted a synthetic queued alert containing only Message
  and Account. It produced an expense draft for MYR25.00 and selected Fuel
  through the keyword matcher, with From, Title, Subtitle and Category absent.
  This check saved no transaction. App preferences, locale and theme stayed
  unchanged; the Wallet example automation was saved and left disabled.
- Rebuilt the iOS development app with From removed from Log Payment Alert.
  Checked a previously saved Wallet shortcut: its Notification Body binding and
  E-Wallet account remained selected, and its automation stayed disabled.
  Legacy source labels in already queued alerts remain readable. Title, Subtitle
  and Category remain optional. Real iPhone notification delivery remains unverified.

## iOS setup video

- Recorded the real Shortcuts editor on the visible iPhone 18 Pro simulator,
  iOS 27, using Argent screen recording with touch visualization enabled.
  Wallet and synthetic Money2Time accounts are the examples. The walkthrough
  covers creating the Notification trigger, selecting the app, keeping Automation
  on and Notify off, adding Log Payment Alert, binding Notification Body to Message,
  choosing Account, and saving. No action requests an app name.
- The final MP4 adds short instructional captions and animated yellow tap rings
  from the recorded tap coordinates, and trims waiting time. It is saved locally as
  `Money2Time-iOS-App-Notifications-Setup.mp4` in Downloads. It does not contain
  private account data or a real payment, and is not uploaded as a PR attachment.
  Verified the 1 minute 48 second, 900 × 2120 H.264 MP4 decodes without errors.
- The recording was stopped and retrieved. The new Wallet demo automation was
  saved, then disabled after recording. Other automations were not changed.
