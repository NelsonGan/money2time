# Payment alert tutorial captures

Captured on 5 October 2026 from the running apps, using Argent screenshots at
full device resolution. Red tap markers come from the accessibility frames;
`scripts/data/autolog-shots.json` stores the reproducible annotation spec.
The 31 indexed PNGs under `assets/autolog/pa_*.png` illustrate 32 steps.

- iPhone 18 Pro, iOS 27.0: manually built Notification and Message automations
  in Shortcuts. Bound Notification Body, Title and Subtitle and Message Content
  to Money2Time's Log Payment Alert action. Configured From and Account, then
  saved both examples. The Notification automation runs with Automation on;
  the Message automation additionally has Confirm Before Run off. Both test
  examples were disabled after capture. No shortcut was manually run.
- Android emulator, API 36: in-app disclosure, system notification access and
  permission confirmation, installed-app selection, account picker and the
  setup's synthetic test alert. Money2Time's own notification permission was
  denied, so this run used the native test-queue fallback. Its successful
  preview showed RM1.00, Everyday Account and Food. The database held 7,099 transactions before and after the
  test, confirming that the preview created no expense. Original app
  preferences, theme and notification access were restored after capture.
- The simulator and emulator windows remained open during testing. The final
  guide pages were checked in Money2Time on both platforms.

## Examples and verification limits

The installed Messages app is the notification example. Maybank was typed as
an example source name and SMS text filter. iOS Simulator has no App Store,
and the existing Android emulator has no functioning Play Store; neither had
an installable Maybank build. These captures do not verify Maybank delivery,
bank login, a real purchase, iPhone automation firing or manufacturer-specific
Android background behavior.

The images show iOS 27. Older iOS SMS instructions retain their earlier flow;
no older runtime is installed here, so those screens were not recaptured.

Tutorial images and captions add no analytics events, properties or triggers.
The Automation topics and screen tracking remain unchanged.
