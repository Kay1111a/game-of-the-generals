# Snakes & Ladders

Open `index.html` in a browser to play offline. Race a computer opponent or pass one device between two, three or four players. Roll a fair six-sided die and land on square 100 exactly to win.

In solo play, each side gets two optional rerolls. Easy keeps every first roll. Medium rerolls when it would slide behind its current square. Hard weighs how soon each landing can lead to a win and the value of saving its remaining rerolls. A replacement roll is final. Local multiplayer uses classic rolls.

## Windows and Android

The Windows x64 game uses Edge WebView2. Build it with `./native/windows/build.ps1` on Windows. The Android game requires Android 9 or later with current System WebView. Build it with JDK 17 and Gradle 8.9 using `gradle -p native/android :app:assembleRelease`.

## Testing

To run the offline browser tests, use Python 3.12 and Chromium.

```sh
python tools/build.py
python -m pip install playwright==1.55.0
python -m playwright install --only-shell chromium
python tests/browser_qa.py
```

The Playtest workflow also plays all six match types in the Windows EXE and the installed Android APK. It saves both packages and screenshots from four browser sizes.
