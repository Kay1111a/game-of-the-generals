"""Exercise the offline download using visible controls and a separate board oracle."""
from collections import deque
import json
import os
from pathlib import Path
import unittest

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
BOARD = (ROOT / "dist" / "SnakesAndLadders.html").as_uri()
OUT = ROOT / "test-results"
LADDERS = {3: 22, 8: 30, 20: 41, 28: 74, 43: 65, 58: 77, 71: 91, 81: 98}
SNAKES = {17: 6, 34: 13, 48: 26, 62: 19, 69: 52, 87: 57, 95: 75, 99: 80}


def destination(start, face):
    square = start + face
    if square > 100:
        return start
    return LADDERS.get(square, SNAKES.get(square, square))


def path_to(start, goal):
    queue, seen = deque([(start, [])]), {start}
    while queue:
        square, path = queue.popleft()
        if square == goal:
            return path
        for face in range(1, 7):
            end = destination(square, face)
            if end < 100 and end not in seen:
                queue.append((end, path + [face]))
                seen.add(end)
    raise AssertionError(f"Unreachable test square {goal}")


class BoardQA(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUT.mkdir(exist_ok=True)
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
        print("Chromium", cls.browser.version, flush=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()

    def setUp(self):
        self.errors = []
        self.ctx = self.browser.new_context(viewport={"width": 1100, "height": 800}, has_touch=True)
        self.ctx.set_offline(True)
        self.p = self.ctx.new_page()
        self.p.set_default_timeout(4000)
        self.p.on("pageerror", lambda e: self.errors.append(str(e)))
        self.p.on("console", lambda m: self.errors.append(m.text) if m.type == "error" else None)
        self.p.on("request", lambda r: self.errors.append(r.url) if r.url.startswith(("http:", "https:")) else None)
        self.p.goto(BOARD)
        expect(self.p.locator("#heading")).to_have_text("Choose a game")

    def tearDown(self):
        self.ctx.close()
        self.assertEqual(self.errors, [], "Unexpected browser errors or external requests")

    def button(self, label):
        return self.p.get_by_role("button", name=label, exact=True)

    def start(self, mode, choice):
        if not self.p.locator("#picker").is_visible():
            self.button("New game").click()
        self.button(mode).click()
        self.button(choice).click()
        expect(self.p.locator("#turn")).to_have_text("Player 1’s turn")

    def dice(self, *faces):
        # Supply only physical die faces. The real handlers decide when a die
        # is consumed, whether a player may reroll, and where the piece goes.
        self.p.evaluate("""faces => {
          if (window.testDice?.length) throw Error("Unconsumed rolls before next turn");
          window.testDice = [...faces];
          Math.random = () => {
            if (!window.testDice.length) throw Error("An extra die was rolled");
            return (window.testDice.shift() - 0.5) / 6;
          };
        }""", list(faces))

    def positions(self):
        scores = self.p.locator("#scores li").all_inner_texts()
        return [int(score.rsplit("·", 1)[1]) for score in scores]

    def key(self, key):
        self.p.keyboard.press(key)
        # Allow the browser's default Escape/dialog actions to finish.
        self.p.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")

    def test_board_and_dice(self):
        rows = self.p.evaluate("""() => Array.from({length:100}, (_, p) =>
          Array.from({length:6}, (_, i) => landing(p, i + 1)))""")
        expected = [[destination(p, n) for n in range(1, 7)] for p in range(100)]
        self.assertEqual(rows, expected)
        centers = self.p.evaluate("() => Array.from({length:100}, (_, i) => point(i + 1))")
        self.assertEqual(len(set(map(tuple, centers))), 100)
        self.assertEqual((centers[0], centers[9], centers[10], centers[99]),
                         ([40, 760], [760, 760], [760, 680], [40, 40]))
        for (x, y), (u, v) in zip(centers, centers[1:]):
            self.assertEqual(abs(x-u) + abs(y-v), 80)
        faces = self.p.evaluate("""() => {
          const old = Math.random, result = [];
          try {
            for (let n=0; n<6; n++) for (const offset of [0, 0.999999]) {
              Math.random = () => (n + offset) / 6;
              result.push(die());
            }
          } finally { Math.random = old; }
          return result;
        }""")
        self.assertEqual(faces, [n for n in range(1, 7) for _ in range(2)])

    def test_difficulty_order(self):
        benchmark = (ROOT / "tests" / "pace.js").read_text(encoding="utf-8")
        for first in (12000, 90000):
            with self.subTest(first_seed=first):
                result = self.p.evaluate(benchmark, {"firstSeed": first, "count": 4096})
                print("Matched dice", first, json.dumps(result), flush=True)
                mean = result["mean"]
                self.assertLess(mean["Medium"], mean["Easy"])
                self.assertLess(mean["Hard"], mean["Medium"])

    def test_escape_keeps_startup_playable(self):
        for key in ("Escape", "Escape"):
            self.key(key)
            expect(self.button("Player vs AI")).to_be_visible()
        self.button("Player vs AI").click()
        self.key("Escape")
        expect(self.button("Local players")).to_be_visible()
        self.key("Escape")
        self.start("Local players", "3 players")

    def test_keyboard_rolls_without_retabbing(self):
        self.dice(3, 3)
        self.button("Local players").focus()
        self.key("Enter")  # Player count
        self.key("Enter")  # Start two-player match
        self.key("Enter")  # Roll for Player 1
        expect(self.p.locator("#turn")).to_have_text("Player 2’s turn")
        self.key("Enter")  # Roll for Player 2, on the same shared keyboard
        self.assertEqual(self.positions(), [22, 22])

    def test_keyboard_continues_after_computer_reply(self):
        self.start("Player vs AI", "Easy")
        self.dice(4, 6, 2)
        self.button("Roll die").focus()
        self.key("Enter")
        self.key("Enter")  # Keep the provisional 4
        expect(self.p.locator("#status")).to_contain_text("Computer rolled 6.")
        self.key("Enter")
        expect(self.p.locator("#roll")).to_have_text("Rolled 2")
        self.assertEqual(self.positions(), [4, 6])

    def local_roll(self, positions, turn, face):
        start = positions[turn]
        self.dice(face)
        self.button("Roll die").click()
        positions[turn] = destination(start, face)
        self.assertEqual(self.positions(), positions)
        expected = f"Player {turn+1} wins!" if positions[turn] == 100 else f"Player {(turn+1)%len(positions)+1}’s turn"
        expect(self.p.locator("#turn")).to_have_text(expected)
        status = self.p.locator("#status")
        expect(status).to_contain_text(f"Player {turn+1} rolled {face}.")
        if start + face > 100:
            expect(status).to_contain_text("Overshoot")
        elif start + face in LADDERS:
            expect(status).to_contain_text("Ladder!")
        elif start + face in SNAKES:
            expect(status).to_contain_text("Snake!")
        expect(self.button("Reroll")).to_be_hidden()

    def test_all_local_sizes_through_win_and_replay(self):
        for size in (2, 3, 4):
            with self.subTest(players=size):
                self.start("Local players", f"{size} players")
                positions = [0] * size
                for turn in range(size):
                    self.local_roll(positions, turn, 3)
                self.assertEqual(positions, [22] * size)
                if size == 4:
                    pixels = self.p.evaluate("""() => {
                      const [x,y] = point(22);
                      const b = document.querySelector("canvas").getContext("2d").getImageData(x-39,y-39,78,78).data;
                      const seen = new Set();
                      for (let i=0; i<b.length; i+=4) seen.add((b[i]*65536 + b[i+1]*256 + b[i+2]).toString(16).padStart(6,"0"));
                      return colors.map(c=>seen.has(c.slice(1)));
                    }""")
                    self.assertEqual(pixels, [True] * size, "Four tokens should remain visible on one square")
                for face in path_to(22, 97) + [6, 3]:
                    self.local_roll(positions, 0, face)
                    if positions[0] != 100:
                        for turn in range(1, size):
                            self.local_roll(positions, turn, 1)
                expect(self.button("Roll die")).to_be_hidden()
                self.button("Play again").click()
                self.assertEqual(self.positions(), [0] * size)
                expect(self.p.locator("#turn")).to_have_text("Player 1’s turn")

    def test_both_reroll_budgets_and_forced_replacement(self):
        self.start("Player vs AI", "Medium")
        # The computer revisits square 16 three times. It can replace the
        # first two snake rolls. The third must use the original die.
        moves = [
            ([6,5,6], True, 5,6), ([2,1,4], True, 6,10),
            ([1,6], False, 7,16), ([1,1,1], False, 30,6),
            ([1,4], False, 31,10), ([1,6], False, 32,16),
            ([1,1,1], False, 33,6), ([1,4], False, 13,10),
            ([1,6], False, 14,16), ([1,1], False, 15,6),
        ]
        for i, (rolls, spend, human, computer) in enumerate(moves):
            self.dice(*rolls)
            self.button("Roll die").click()
            if spend:
                expect(self.p.locator("#status")).to_contain_text(f"{2-i} reroll")
                self.button("Reroll").click()
            else:
                expect(self.button("Reroll")).to_be_hidden()
            expect(self.p.locator("#turn")).to_have_text("Player 1’s turn")
            self.assertEqual(self.positions(), [human, computer])
            self.assertEqual(self.p.evaluate("window.testDice.length"), 0)

    def test_pause_resume_and_prevent_stale_ai_move(self):
        self.start("Player vs AI", "Easy")
        self.dice(4, 6)
        self.button("Roll die").click()
        self.button("New game").click()
        self.button("Local players").click()
        self.button("Resume game").click()
        expect(self.p.locator("#roll")).to_have_text("Rolled 4")
        # Open help in the same browser task as Keep so that a busy test
        # runner cannot miss the window before the computer's turn.
        self.button("Keep roll").evaluate("b=>{b.click();document.querySelector('#rules').click()}")
        expect(self.p.locator("#guide")).to_be_visible()
        self.p.wait_for_timeout(1100)  # Longer than both AI timer phases
        self.assertEqual(self.positions(), [4, 0])
        self.assertEqual(self.p.evaluate("window.testDice.length"), 1)
        self.button("Back to game").click()
        expect(self.p.locator("#status")).to_contain_text("Computer rolled 6.")
        self.dice(2, 5)
        self.button("Roll die").click()
        self.button("Keep roll").evaluate("b=>{b.click();document.querySelector('#menu').click()}")
        self.start("Local players", "4 players")
        self.p.wait_for_timeout(1100)
        self.assertEqual(self.positions(), [0, 0, 0, 0])
        self.button("Roll die").click()
        self.assertEqual(self.positions(), [5, 0, 0, 0])

    def test_touch_layouts(self):
        for width, height in ((320, 568), (390, 844), (740, 360), (1280, 800)):
            with self.subTest(viewport=(width, height)):
                self.p.set_viewport_size({"width": width, "height": height})
                self.p.reload()
                self.button("Local players").tap()
                self.button("4 players").tap()
                self.dice(3)
                self.button("Roll die").tap()
                self.assertEqual(self.positions(), [22, 0, 0, 0])
                dims = self.p.evaluate("""() => {
                  const b = document.querySelector('canvas').getBoundingClientRect();
                  return {page:document.documentElement.scrollWidth, left:b.left, right:b.right, w:b.width, h:b.height}
                }""")
                self.assertLessEqual(dims["page"], width, dims)
                self.assertGreaterEqual(dims["left"], 0, dims)
                self.assertLessEqual(dims["right"], width+1, dims)
                self.assertAlmostEqual(dims["w"], dims["h"], delta=1)
                self.p.screenshot(path=str(OUT / f"board-{width}x{height}.png"), full_page=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
