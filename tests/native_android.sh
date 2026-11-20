#!/usr/bin/env bash
set -euo pipefail
adb install -r dist/Salpakan.apk
adb install -r native/android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
adb shell svc wifi disable
adb shell svc data disable
adb logcat -c
adb shell am instrument -w io.github.kay1111a.salpakan.test/androidx.test.runner.AndroidJUnitRunner | tee dist/android-instrumentation.txt
adb logcat -d -s SalpakanQA:I AndroidRuntime:E
grep -Eq '^OK \(1 test\)' dist/android-instrumentation.txt
