# Snakes & Ladders 1.0.1 playtest

Tested on November 21, 2026. The baseline run used the 1.0.0 game with the new tests. The follow-up run used the corrected 1.0.1 game. All tests drive the offline edition. The native tests launch the packaged application and use its real WebView.

## Bugs reproduced and fixed

| ID | Severity | Steps to reproduce in 1.0.0 | Expected and observed behavior | Fix and retest in 1.0.1 |
| --- | --- | --- | --- | --- |
| SL-01 | High | 1. Open the game in Chromium. 2. Press Escape at the first menu. | The mode choices should stay available. The dialog disappeared, leaving no way to start a match without reloading. | The picker handles Escape and the Android Back event explicitly. Repeated Escape at startup, Back from difficulty, and closing the picker mid-match all passed. |
| SL-02 | Medium | 1. Use Enter to select Local players and 2 players. 2. Press Enter to roll twice. 3. In a solo match, repeat with Roll die, Keep roll, and the next turn after the computer replies. | Enter should activate the next turn action. Focus was lost as buttons were replaced. The next player could be left waiting for a roll, or a provisional roll could remain unconfirmed. | Starting a match focuses Roll die. When turn controls are rebuilt, keyboard focus follows the action. Both keyboard sequences passed. |
| SL-03 | Medium | 1. Use the same die streams for each AI level. 2. Measure turns from square 0 to exactly 100 with two rerolls. 3. Repeat with the second batch below. | Hard should use its limited rerolls at least as effectively as Medium across these samples. Hard took over three extra turns on average in both batches. | Hard now evaluates each landing with its remaining rerolls and how soon an opponent could finish. It took fewer turns than Medium in both reruns. |
| SL-04 | Medium | 1. Start a local game. 2. Look at squares 82, 64 and 6 where artwork crosses their numbers. 3. Compare the desktop and phone-size boards. | All numbers should be legible. Snakes and ladder rails were painted over these labels. | The renderer draws outlined numbers above the artwork and leaves space between numbers and pawns. The pixel test checked all 100 labels. The desktop and phone screenshots were also inspected. |

All four fixes are in `index.html`. The regressions are in `tests/browser_qa.py` and the repeatable difficulty comparison is in `tests/pace.js`.

## Test results

| Platform or check | Observed result |
| --- | --- |
| Offline Chromium 140.0.7339.16 | 10 of 10 tests passed. The suite also checked for uncaught page errors, console errors and external network requests. |
| Board rules | All 600 combinations of starting square 0–99 and die face 1–6 matched an independent board model. This covers all eight ladders, eight snakes, exact wins and overshoots. All 100 board positions and 12 die boundary cases passed. |
| Local multiplayer | Two-, three- and four-player games passed turn-order, exact-win and replay checks. All four pawns remained visible together on square 22. |
| Solo and menus | Both sides exhausted their two rerolls correctly. A replacement was final. A pending human roll survived a menu visit. The computer waited while help was open, and a previous computer turn could not affect a newly started game. |
| Touch and layout | Tapping worked at 320 × 568, 390 × 844, 740 × 360 and 1280 × 800. The square board fit the viewport width at each size. |
| Windows x64 | The EXE completed and restarted Easy, Medium, Hard and local games for 2, 3 and 4 players in its offline Edge WebView2. |
| Android 15 | The Pixel 6 emulator installed the APK. With Wi-Fi and mobile data disabled, an Android touch event opened difficulty selection and the system Back key returned to game selection. The installed WebView then completed and restarted all six match types. Physical-device testing is still open. |

### Difficulty results

Each batch contains 4,096 seeded die streams. Each level receives the same first and replacement dice each turn. The figures are average turns to reach 100. A lower average means a faster finish in that sample.

| First seed | Easy | Medium | Hard in 1.0.0 | Hard in 1.0.1 |
| --- | ---: | ---: | ---: | ---: |
| 12000 | 37.91 | 29.32 | 33.18 | 28.85 |
| 90000 | 37.71 | 29.60 | 33.72 | 29.27 |

### Reproduce the checks

- **Browser.** Run `python tools/build.py`, install Playwright and Chromium as described in the README, then run `python tests/browser_qa.py`. To run the current suite against an older download, set `SNAKES_QA_HTML` to the path of that HTML file.
- **Windows x64.** Run `./native/windows/build.ps1`, then `python tests/native_windows.py`. The EXE reported `"done":true` and listed all six modes.
- **Android.** With the Android SDK, JDK 17, Gradle 8.9 and an Android 15 emulator running, use `gradle -p native/android :app:assembleRelease :app:assembleReleaseAndroidTest`. Copy `native/android/app/build/outputs/apk/release/app-release.apk` to `dist/SnakesAndLadders.apk`, then run `bash tests/native_android.sh`. Instrumentation reported `OK (1 test)` and logged all six modes.
- **Build evidence.** The workflow retains the two packaged builds and four layout screenshots. [Baseline run](https://github.com/Kay1111a/game-of-the-generals/actions/runs/44768675368) · [Passing 1.0.1 run](https://github.com/Kay1111a/game-of-the-generals/actions/runs/44853648418)

The downloaded EXE and APK both contained the exact offline HTML used for the browser tests. The APK passed signature verification. The published 1.0.0 and 1.0.1 APKs have different development signing certificates, so Android users with the older version installed must uninstall it before installing 1.0.1.

**Outcome.** Four gameplay bugs found, four fixed and retested, zero blocked. The Windows and emulator playthroughs were automated.
