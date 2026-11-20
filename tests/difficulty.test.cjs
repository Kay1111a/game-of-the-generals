"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/rules.js");
const AI = require("../src/opponent.js");

function seeded(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test("all difficulties respect turn, concealed ranks, and the same movement rules", () => {
  for (const difficulty of ["easy", "medium", "hard"]) {
    const g = R.newGame({difficulty, first:R.PINE}, seeded(5));
    assert.equal(g.settings.difficulty, difficulty);
    assert.equal(AI.chooseMove(R.viewFor(g, R.PINE), seeded(1), difficulty), null);
    R.seal(g, R.IVORY); R.seal(g, R.PINE);
    const a = R.viewFor(g, R.PINE);
    const from = g.board.findIndex(p => p?.side === R.IVORY && p.rank === "flag");
    const to = g.board.findIndex(p => p?.side === R.IVORY && p.rank === "spy");
    [g.board[from], g.board[to]] = [g.board[to], g.board[from]];
    const b = R.viewFor(g, R.PINE);
    assert.deepEqual(a, b);
    const choice = AI.chooseMove(a, seeded(9), difficulty);
    assert.deepEqual(choice, AI.chooseMove(b, seeded(9), difficulty));
    assert.ok(R.targets(g.board, R.PINE, choice.from).includes(choice.to));
  }
  assert.equal(R.newGame().settings.difficulty, "medium");
  assert.equal(R.newGame({difficulty:"unknown"}).settings.difficulty, "medium");
});

test("paired matches benchmark adjacent difficulties on the same formations from both sides", () => {
  for (const [lower, upper] of [["easy","medium"], ["medium","hard"]]) {
    const wins = {[lower]:0, [upper]:0, draws:0};
    for (let seed = 1; seed <= 32; seed++) {
      for (const ivory of [lower, upper]) {
        const pine = ivory === lower ? upper : lower;
        const g = R.newGame({mode:"duo", tournament:true}, seeded(seed));
        const random = {ivory:seeded(31 * seed), pine:seeded(31 * seed + 1)};
        R.seal(g, R.IVORY); R.seal(g, R.PINE);
        while (g.phase === "play" && g.history.length < 1200) {
          const side = g.turn, level = side === R.IVORY ? ivory : pine;
          const move = AI.chooseMove(R.viewFor(g, side), random[side], level);
          assert.ok(R.targets(g.board, side, move.from).includes(move.to));
          R.move(g, side, move.from, move.to);
        }
        assert.equal(g.phase, "over", "unfinished game at seed " + seed);
        if (g.result.winner) wins[g.result.winner === R.IVORY ? ivory : pine]++;
        else wins.draws++;
      }
    }
    console.log("Paired benchmark", JSON.stringify(wins));
    assert.ok(wins[upper] > wins[lower], upper + " should win more games in the paired sample");
  }
});
