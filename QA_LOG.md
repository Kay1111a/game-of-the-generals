# QA log

## Reproduced and fixed

| ID | Severity | Where | Reproduction | Expected and observed | Fix and retest |
| --- | --- | --- | --- | --- | --- |
| G-01 | Medium | Solo opponent, `src/opponent.js` | 1. Put Ivory's Flag on B7, a second Ivory piece on D2, Pine's Flag on A8 and Pine's Sergeant on C8. 2. Move Ivory's Flag to B8. 3. Let Pine move. | Pine could intercept B8 with the Sergeant. It moved its own Flag to A7 and lost immediately. | Prioritize intercepting an unidentified piece that just reached the back row when a non-Flag can challenge it. The AI still receives a concealed rank on B8. The targeted test now ends in Pine's capture victory. |
| G-02 | Low | Arbiter rank validation, `src/rules.js` | 1. Call `challenge("constructor", "flag")`. 2. Repeat with other unknown identifiers. | Unknown identifiers should be rejected. The first call returned an attacker victory because the rank map inherited that name. Normal deployment could not generate this identifier. | Require an own property of the rank map for both pieces. Retested invalid names on both sides and all 225 valid pairings. |
| QA-01 | Test infrastructure | Browser job, `.github/workflows/game.yml` | 1. Run the browser setup on the original `ubuntu-latest` runner. 2. Install the pinned Playwright Chromium. | The browser suite should launch. Playwright 1.55 reported that it did not support the resolved Ubuntu 26.04 image. No browser check ran in that job. | Pin the Linux runner to Ubuntu 24.04 and add Windows Server 2025 to the same suite. |
| B-01 | Low | Packaging, `tools/build.py` | 1. Build the same commit on Windows and Linux. 2. Compare the SHA-256 digests of the two playtested HTML files. | Both games played correctly, but differed by 1,505 carriage-return bytes. The files matched after normalizing newlines. | Write the UTF-8 payload as bytes, print the digest at build time and assert canonical line endings in the browser suite. |

## Rules regression

`node --test tests/game.test.cjs` passed 19 tests. Coverage includes every ordered rank pairing, every board square, deployment validity for 50 formations, both opening colors, both coin results, invalid moves, capture and breakthrough, one-reply timing, challenges with and without rank reveals, hidden-rank invariance, draws and resignation.

The seeded self-play test ran 96 full matches and checked every move for legality and piece conservation. The final run covered 10,426 individual turns, with 46 Flag captures and 50 breakthroughs. A separate repetition fixture exercised a drawn game.

The first rules-regression run failed the two targeted game checks above. Both passed after fixes, followed by a full regression run. Those original failures and their retests are intentionally represented in the continuing suite.


## Browser matches

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

## Reproduce

```sh
node --test tests/game.test.cjs
python tools/build.py
python -m pip install playwright==1.55.0
python -m playwright install chromium
python tests/browser.py
```

The downloadable HTML has SHA-256 `f14173d933e7ec52948e9652d7565c253f7436d660557840f59e50af0f01956e`. The workflow prints the digest before playing the artifact, then saves the game, screenshots and `playthroughs.json`.

[Windows and Linux gameplay run](https://github.com/Kay1111a/game-of-the-generals/actions/runs/44637060874) · [Latest verification and build artifacts](https://github.com/Kay1111a/game-of-the-generals/actions/workflows/game.yml)
