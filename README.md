# Salpakan · Game of the Generals

An offline edition of the Filipino hidden-rank board game. Arrange 21 pieces, challenge the other army one square at a time, and protect your Flag. Play against the computer or take turns with a friend on one screen.

## Windows and Android apps

[Download the latest release](https://github.com/Kay1111a/game-of-the-generals/releases/latest). Open **Salpakan.exe** on Windows 10/11 x64, or install **Salpakan.apk** on Android 9 or later. Each contains the full game and plays offline. Windows uses the Microsoft Edge WebView2 Runtime. Android needs System WebView or Chrome version 105 or newer. The Windows app is unsigned. The APK uses a development signing certificate for sideloading. To upgrade from the published Android v1.1.0 to v1.2.0, uninstall the old APK first because those releases use different signing certificates.

Opening the game shows **Player vs AI** and **Two Players**. Choose **Player vs AI** to open the difficulty screen. Selecting **Easy**, **Medium**, or **Hard** starts deployment, and Pine uses that level from its first move. **Two Players** goes straight to the private **Pass to Ivory** handoff. Both players share the same device.

**Easy** varies its moves and occasionally takes risks. **Medium** remembers challenge outcomes and looks for favorable exchanges. **Hard** also tracks remaining ranks, considers an adjacent recapture and looks for a safe route for its Flag. **New match** opens the mode choices again. **Play again** repeats the last mode and difficulty.

## Play the browser edition

1. Download the repository ZIP from **Code → Download ZIP** and extract it.
2. Open **index.html** in a modern browser. Keep the extracted files together.
3. Choose a mode on the opening screen. To set who moves first or enable optional rules, open **Match options** before choosing your mode.
4. Select a piece, then a square in your three home rows to move or swap it. **Shuffle** proposes another formation. **Lock formation** starts play after both sides have deployed.
5. Each turn, select your own piece and choose a marked destination. On a keyboard, tab to the board, use the arrow keys to navigate, Enter or Space to choose a square, and Escape to clear your selection. In two-player mode, hand over the device while the board is concealed.

The match runs entirely on your device. Refreshing or closing the page ends the current session. To carry the game as one file, run the build below or download the artifact of a successful **Playtest** run under GitHub Actions and open **Salpakan.html**.

## Rules

The supplied *Game of the Generals (Salpakan) Rules & Mechanics* guide is the rules reference for this implementation. The in-game **Rules & ranks** panel lists every rank and quantity.

- Each army occupies 21 of its nearest 27 squares on a 9-by-8 board. The two middle rows start empty. Choose who opens or flip a coin in **New match**.
- Move exactly one square horizontally or vertically. Entering an enemy square starts a challenge. The surviving piece keeps that square. Equal ranks remove each other, except that an attacking Flag captures a defending Flag.
- Officers beat lower officers and Privates. Spies beat officers, including the 5-Star General. Privates beat Spies. A Flag loses any challenge with a non-Flag.
- Capture the enemy Flag to win. A Flag reaching the far row wins immediately if no enemy is orthogonally adjacent. Otherwise it must survive the opponent’s next move.
- Both players can agree to a draw. A declined draw leaves the offering player’s turn intact. **Resign** concedes the match and can record an agreed forfeit.
- The arbiter conceals enemy ranks. As an optional rule, both players can briefly see the two challenge ranks, then continue with covered pieces. The optional tournament setting declares a draw on the third occurrence of the full position with the same turn, without an intervening capture. The guide gives prolonged repetition as a tournament example and leaves the threshold open. With just two Flags, you can still win by initiating a challenge. Offer a draw to settle a stalemate.

## How solo play works

The computer receives its own ranks, enemy locations, and outcomes of past challenges. It follows surviving pieces and uses those outcomes to narrow their possible ranks. It weighs challenges, threats to its Flag and possible breakthroughs. This is a local, rule-based opponent. It works offline without an API key.

## Build and test

Use Node.js 22+ and Python 3.10+ for development. The browser edition runs offline.

```sh
node --test tests/game.test.cjs tests/difficulty.test.cjs
python tools/build.py
python -m pip install playwright==1.55.0
python -m playwright install chromium
python tests/browser.py
```

On Windows, `py` can be used in place of `python`. The build creates **dist/Salpakan.html** with the font, styles, scripts, and font license embedded. Browser tests exercise both the source and single-file version and save results under **test-results/**. GitHub Actions runs the same tests on each push.

| File | Purpose |
| --- | --- |
| `native/windows`, `native/android` | Desktop and mobile app hosts and build projects |
| `src/rules.js` | Deployment, legal moves, challenges, victory, draw handling and player-specific views |
| `src/opponent.js` | AI move selection and memory of observed challenges |
| `src/app.js` | Board, private handoffs, setup, turn controls and move log |
| `index.html`, `styles.css` | Interface, rules panel, responsive board and piece designs |
| `tests/`, `QA_LOG.md` | Automated checks, played scenarios, results and fixes |
| `assets/FONT-LICENSE.txt` | SIL Open Font License for the bundled Instrument Serif typeface |


## Build the native apps

- **Windows.** Install Visual Studio 2022 or later with Desktop development with C++, the Windows SDK, CMake, the NuGet CLI and Python 3. From a PowerShell prompt run `./native/windows/build.ps1`. The portable executable is written to `dist/Salpakan.exe`. The build embeds the game and statically links the WebView2 loader. To replay the packaged Windows checks locally, run `python tests/native_windows.py` after building. It launches the same executable with its built-in `--self-test` switch.
- **Android.** Use JDK 17, Android SDK platform 35, Gradle 8.9 and Python 3 on your PATH. Run `gradle -p native/android :app:assembleRelease`. The installable APK is in `native/android/app/build/outputs/apk/release/`. The sideload build uses the local Android debug keystore. Keep your own signing key for store releases and future updates.
- **Playtests.** Run `node --test tests/game.test.cjs tests/difficulty.test.cjs` for the rules and paired difficulty tournament. The Playtest workflow builds both apps, plays full matches against all three levels and checks shared-device play in the installed apps. A release commit marked `[release]` publishes both verified packages using the version in `native/VERSION`.
