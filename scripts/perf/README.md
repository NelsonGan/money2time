# Performance measurement

Scripts for timing cold start and transaction entry on a simulator or
emulator with a large data set. They read the `[m2t-perf]` lines that
`utils/perfTrace.ts` logs, which only exist in a build bundled with
`EXPO_PUBLIC_PERF_TRACE=1`; every other build compiles the probes away.

1. Build a release app with the probes on, e.g.
   `EXPO_PUBLIC_PERF_TRACE=1 ./gradlew assembleRelease` in `android/`, or
   `EXPO_PUBLIC_PERF_TRACE=1 xcodebuild -configuration Release -sdk iphonesimulator ...`
   in `ios/`. Measure the build you compare against the same way.
2. Load the data set once (restore a backup in the app), then save a snapshot
   so every run starts from the same state:
   - iOS: copy `Documents/SQLite` and `Documents/user-assets` out of the app's
     data container and pass that folder as `--golden`.
   - Android: tar `files/SQLite` and `files/user-assets` to
     `/data/local/tmp/golden.tar` on the device (the scripts restore it as root).
3. Run the scripts, several times per build, and compare medians:
   - `measure-startup.mjs <ios|android> --device <id> --runs 10 --golden <dir|any>`
     times launch to first screen, the data load, and the frame gaps in the
     five seconds after the splash lifts. `--backup-due` marks the daily
     auto-backup as due, as on the first launch of a day.
   - `measure-save-android.mjs` times a quick-add save.
   - `measure-launch-tap-android.mjs` times a tap on + shortly after launch.

On Android, compile the app ahead of time before measuring (`adb shell cmd
package compile -m speed -f <package>`) so both builds run the same way. On a
Mac, keep the emulator's window in front or run it with `-no-window`: macOS
demotes the emulator's threads to background priority while its window is
hidden, which slows it down several times over mid-run.
