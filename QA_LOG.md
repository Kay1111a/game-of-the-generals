# QA log

## Version 1.2.0 · Choose a mode at launch

Fresh launches open the opponent menu with zero board squares and zero pieces. **Player vs AI** opens the three difficulty choices. **Two Players** starts with **Pass to Ivory** and keeps both formations concealed until the correct player reveals the board.

### First-move regression

The browser test starts each difficulty from the same formation with Pine moving first (seed 18). It compares the visible first move to an independent copy of the rules and selected strategy. Each level makes a different opening in this position.

| Selected button | First move in the game |
| --- | --- |
| Easy | F7 → E7 |
| Medium | H6 → H5 |
| Hard | H8 → H7 |

The tests also open **New match** after Pine moves, back out of the difficulty choice and return to the existing board. The mode, move log and turn survive. On a 740 × 360 landscape screen all three choices and Back fit in view. The 360-pixel keyboard and 390-pixel shared-device tests exercise the portrait layout.

### Issues found during playtesting

**MENU-01 · Medium · Keyboard in Chromium on Windows and Linux**

1. Open a fresh game and press Escape.
2. Press Enter on **Player vs AI**, then press Escape from the difficulty screen.

Expected the mode chooser to regain focus. The browser could dismiss the entire dialog on the second Escape. The picker now handles Escape directly and controls its own dismissal. The same key sequence passed on both operating systems. Files changed in `index.html` and `src/app.js`. [Initial reproduction](https://github.com/Kay1111a/game-of-the-generals/actions/runs/44738655972)

**QA-02 · Medium · Android instrumentation**

1. Boot a fresh Pixel 6 emulator, install the APK and start the touch test.
2. Send the first tap as soon as the WebView reports its first rendered frame.

Android rejected the tap because it would have reached a window owned by another process. The test now waits for the game to own focus, hit-tests the rendered button and sends a touchscreen event through Android. Each tap must still produce the expected screen. Files changed in `native/android/app/src/androidTest/java/io/github/kay1111a/salpakan/BoardTest.java` and `tests/native_android.sh`. [Reproduction](https://github.com/Kay1111a/game-of-the-generals/actions/runs/44738956177)

On retest the installed APK accepted a touchscreen tap on **Player vs AI**, Android Back returned to the mode choices with zero pieces visible, and tapping **Hard** after reselecting AI opened the 72-square deployment board. Restarting the activity reopened the mode chooser. Both issues above passed their original regression on the final build.

### Release playtests

| Command | Result |
| --- | --- |
| `node --test tests/game.test.cjs tests/difficulty.test.cjs` | All 21 rules and strategy tests passed. |
| `python tools/build.py` followed by `python tests/browser.py` | All seven reported checks passed on Windows and Linux. No browser errors or external HTTP requests were recorded. |
| `python tests/native_windows.py` | The Windows x64 EXE finished Easy in 67 individual moves, Medium in 123, Hard in 121 and local two-player in 5. |
| `bash tests/native_android.sh` | The APK installed on an Android 15 Pixel 6 emulator and finished the same four games with Wi-Fi and mobile data disabled. The Android runner reported `OK (1 test)`. |

The tested Windows and Android downloads contain the identical 152,018-byte game document. Its SHA-256 is `6f3da295195034869ee4ca35996002bbb4fc7e50c8ce3d5ca41e60322c06b27e`. Both package hashes matched the GitHub release assets. Android device coverage used an emulator.

| Download | Bytes | SHA-256 |
| --- | ---: | --- |
| Salpakan.exe | 338944 | `7c9aa970a7055da2a20c44033cd59c6d4012bc89230abe271a1bef7865b3606a` |
| Salpakan.apk | 80266 | `2d81ad46822c830207cfcd74de924f44fbc6d94ed98957336ee8799a08ef44a9` |

[Version 1.2.0 release](https://github.com/Kay1111a/game-of-the-generals/releases/tag/v1.2.0) · [Final build and platform playtests](https://github.com/Kay1111a/game-of-the-generals/actions/runs/44739827715)

## Version 1.1.0 · Windows and Android

The game ships as a Windows x64 executable and a sideloadable Android APK. Both embed the same offline board and opponents. The original rules and browser checks still run in CI. The full suite passed 21 engine tests, including the original 96 self-play matches.

### Difficulty checks

Each pair played identical starting formations with its colors swapped. A second independent batch used seeds 1001–1064. The wins below measure these samples. Individual games can go either way.

| Pair | Regression batch · 64 matches | Independent batch · 128 matches |
| --- | --- | --- |
| Medium vs Easy | 48–16 | 92–36 |
| Hard vs Medium | 36–28 | 68–60 |

All three levels rejected off-turn moves and gave the same answer to identical visible positions after hidden enemy identities were swapped. The difficulty setting defaults to Medium, persists for Play Again and is hidden for local two-player matches.

### Packaged playthroughs

These results came from the released EXE and an installed APK. The Windows host ran the public board controls in its own WebView2 window. The Android 15 emulator ran the APK with Wi-Fi and mobile data disabled, used a touchscreen event to open New match and sent Android Back to dismiss it. Each solo game finished by capture or breakthrough, followed by Play Again. The two-player match ended by capturing a Flag after private handoffs.

| Mode | Windows x64 | Android 15 emulator |
| --- | --- | --- |
| Easy | 67 individual moves | 67 individual moves |
| Medium | 123 individual moves | 123 individual moves |
| Hard | 121 individual moves | 121 individual moves |
| Local two-player | 5 individual moves | 5 individual moves |

The computer driver for the human seat used visible squares and challenge outcomes. The test scenarios are deterministic. No physical Android phone was used.

### Fixes during platform QA

- The first Windows test could not attach its external driver to the WebView2 debug port. The shipped executable now supports a fixed offline `--self-test` using WebView2's normal native scripting API. All four matches passed without opening a debugging port.
- The standalone document's offline content policy exposed a Playwright wait that evaluated a string. The test now observes the visible turn heading through a locator. Windows and Linux browser suites passed with the content policy active.
- A cold Android emulator sometimes returned a closed dialog immediately after the first synthetic tap. The release test passed on a fresh emulator. The subsequent test-harness revision also dismisses the lock screen, waits for a composited board, taps the visible native button bounds where available, and waits for the actual dialog state before sending Back.

### Release verification

| Download | Bytes | SHA-256 |
| --- | ---: | --- |
| Salpakan.exe | 333824 | `7c8dcd65b76c38fdef04a20a28983c88803e433bdcdace2e80281cc02aa15ef1` |
| Salpakan.apk | 79486 | `7a9380eb5668e46e43d6cf96fb979fa73d254c85dea1757588612fc832e86a77` |

Both packages contain the same 149167-byte game document, with SHA-256 `087c0e40b9e0834f99b368c435c8c4f680faed761b4892f0d3cff785f3618806`. The Windows PE header identifies an unsigned x64 GUI executable. Android's signing tool verified the APK's v2 signature. The release asset digests match the tested downloads.

[Version 1.1.0 release](https://github.com/Kay1111a/game-of-the-generals/releases/tag/v1.1.0) · [Release build and platform playtests](https://github.com/Kay1111a/game-of-the-generals/actions/runs/44692191260)

## Original browser-only release

### Reproduced and fixed

| ID | Severity | Where | Reproduction | Expected and observed | Fix and retest |
| --- | --- | --- | --- | --- | --- |
| G-01 | Medium | Solo opponent, `src/opponent.js` | 1. Put Ivory's Flag on B7, a second Ivory piece on D2, Pine's Flag on A8 and Pine's Sergeant on C8. 2. Move Ivory's Flag to B8. 3. Let Pine move. | Pine could intercept B8 with the Sergeant. It moved its own Flag to A7 and lost immediately. | Prioritize intercepting an unidentified piece that just reached the back row when a non-Flag can challenge it. The AI still receives a concealed rank on B8. The targeted test now ends in Pine's capture victory. |
| G-02 | Low | Arbiter rank validation, `src/rules.js` | 1. Call `challenge("constructor", "flag")`. 2. Repeat with other unknown identifiers. | Unknown identifiers should be rejected. The first call returned an attacker victory because the rank map inherited that name. Normal deployment could not generate this identifier. | Require an own property of the rank map for both pieces. Retested invalid names on both sides and all 225 valid pairings. |
| QA-01 | Test infrastructure | Browser job, `.github/workflows/game.yml` | 1. Run the browser setup on the original `ubuntu-latest` runner. 2. Install the pinned Playwright Chromium. | The browser suite should launch. Playwright 1.55 reported that it did not support the resolved Ubuntu 26.04 image. No browser check ran in that job. | Pin the Linux runner to Ubuntu 24.04 and add Windows Server 2025 to the same suite. |
| B-01 | Low | Packaging, `tools/build.py` | 1. Build the same commit on Windows and Linux. 2. Compare the SHA-256 digests of the two playtested HTML files. | Both games played correctly, but differed by 1,505 carriage-return bytes. The files matched after normalizing newlines. | Write the UTF-8 payload as bytes, print the digest at build time and assert canonical line endings in the browser suite. |

### Rules regression

`node --test tests/game.test.cjs` passed 19 tests. Coverage includes every ordered rank pairing, every board square, deployment validity for 50 formations, both opening colors, both coin results, invalid moves, capture and breakthrough, one-reply timing, challenges with and without rank reveals, hidden-rank invariance, draws and resignation.

The seeded self-play test ran 96 full matches and checked every move for legality and piece conservation. The final run covered 10,426 individual turns, with 46 Flag captures and 50 breakthroughs. A separate repetition fixture exercised a drawn game.

The first rules-regression run failed the two targeted game checks above. Both passed after fixes, followed by a full regression run. Those original failures and their retests are intentionally represented in the continuing suite.


### Browser matches

The gameplay pass used real Chromium 140.0.7339.16 on GitHub-hosted Windows Server 2025 and Ubuntu 24.04. Playwright chose pieces, tapped or clicked squares, read the visible board and move log, and asserted the result screen. The solo driver got only the information visible to Ivory. No test modifies the running game's position. The four complete board matches below ran on each OS. The suite also ended separate matches by agreement and resignation.

| Scenario | Observed outcome on both platforms |
| --- | --- |
| Solo, single-file download | Ivory won on the far row after 123 individual turns. Play Again restored the 21-piece setup and an empty log. |
| Two players, phone-sized viewport | The players swapped the device behind a concealed board. The Pine view rotated. Ivory's attacking Flag captured Pine's defending Flag on turn 5. Both ranks appeared only in the chosen reveal variant. |
| Back-row Flag, defender moves elsewhere | After Ivory reached A8, the game gave Pine one reply. Ivory won on turn 10. |
| Back-row Flag, defender intercepts | Pine saw a concealed piece on A8, captured it, and won on turn 10. |
| Draws and resignation | A declined offer preserved the active turn. Acceptance finished a drawn game. Cancelling resignation kept the game active, and confirming it awarded the opponent the win. |
| Inputs and layouts | Keyboard movement and selection, touch handoffs, shuffle, computer opening turn and a 360px layout passed. Inspected desktop and 390px mobile screenshots. Browser errors and external HTTP requests were both zero. |

The test inputs are reproducible, so the same deterministic matches on two systems count as the same scenarios. Touch was emulated in a real browser. Physical phones, Safari and Firefox were not tested.

### Reproduce

```sh
node --test tests/game.test.cjs
python tools/build.py
python -m pip install playwright==1.55.0
python -m playwright install chromium
python tests/browser.py
```

The original browser-only release had SHA-256 `f14173d933e7ec52948e9652d7565c253f7436d660557840f59e50af0f01956e`. The workflow prints the digest before playing the artifact, then saves the game, screenshots and `playthroughs.json`.

[Windows and Linux gameplay run](https://github.com/Kay1111a/game-of-the-generals/actions/runs/44637060874) · [Latest verification and build artifacts](https://github.com/Kay1111a/game-of-the-generals/actions/workflows/game.yml)
