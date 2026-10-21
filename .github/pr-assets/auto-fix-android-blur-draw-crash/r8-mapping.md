# R8 mapping for the release build, before and after the keep rule

## Before: a local release build made on 2026-10-12, without the keep rule

com.swmansion.rnscreens.Screen -> com.swmansion.rnscreens.s:
com.swmansion.rnscreens.ScreenStack -> com.swmansion.rnscreens.L:

## After: this branch, ./gradlew :app:minifyReleaseWithR8 (2026-10-21)

19:-keepnames class com.swmansion.rnscreens.Screen
com.swmansion.rnscreens.Screen -> com.swmansion.rnscreens.Screen:
com.swmansion.rnscreens.ScreenStack -> com.swmansion.rnscreens.K:

## expo-blur 15.0.8 ExpoBlurView.kt, the lookup that needs the original name

152: return className == "com.swmansion.rnscreens.Screen"
157: return decorView?.findViewById(android.R.id.content)
