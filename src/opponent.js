"use strict";

const SalpakanAI = (() => {
  const R = typeof module !== "undefined" && module.exports ? require("./rules.js") : Salpakan;
  const pool = R.ranks.flatMap(rank => Array(rank.count).fill(rank.id));
  const value = {g5:12, g4:11, g3:10, g2:9, g1:8, col:7, ltc:6, maj:5, cpt:5,
    lt1:4, lt2:4, sgt:3, pvt:4, spy:10, flag:120};
  const distance = (a, b) => Math.abs(R.file(a) - R.file(b)) + Math.abs(R.row(a) - R.row(b));

  // Follow concealed survivors using only movement and the ranks of our own casualties.
  function beliefs(view) {
    const known = new Map();
    for (const e of view.history) {
      const enemyMoves = e.side !== view.side;
      const candidates = known.get(enemyMoves ? e.from : e.to) || pool;
      if (enemyMoves) known.delete(e.from);
      known.delete(e.to);
      if (enemyMoves && e.verdict === "quiet") known.set(e.to, candidates);
      if ((enemyMoves && e.verdict === "attack") || (!enemyMoves && e.verdict === "defend")) {
        const possible = e.otherRank ? [e.otherRank] : candidates.filter(rank =>
          (enemyMoves ? R.challenge(rank, e.ownRank) : R.challenge(e.ownRank, rank)) === e.verdict);
        known.set(e.to, possible.length ? possible : pool);
      }
    }
    return known;
  }
  function chooseMove(view, random = Math.random) {
    if (view.phase !== "play" || view.turn !== view.side) return null;
    const {board, side, history} = view, enemy = R.other(side);
    const foes = board.flatMap((p, i) => p?.side === enemy ? [i] : []);
    const flag = board.findIndex(p => p?.side === side && p.rank === "flag");
    const known = beliefs(view);
    const possible = i => foes.length === 1 ? ["flag"] : known.get(i) || pool;
    const front = i => Math.abs(R.row(i) - R.farRow(side));
    const near = i => Math.min(...foes.map(f => distance(f, i)));
    const threats = R.neighbors(flag).filter(i => board[i]?.side === enemy);
    const recent = history.slice(-16).filter(e => e.side === side);
    const lastEnemy = history.at(-1);
    let best = null, bestScore = -Infinity;
    for (const action of R.moves(board, side)) {
      const {from, to} = action, mine = board[from].rank;
      const taking = board[to]?.side === enemy;
      const exposed = R.neighbors(to).filter(i => board[i]?.side === enemy);
      let score = random() * 3 + (front(from) - front(to)) * 1.8 + (near(from) - near(to)) * 1.7;
      let success = 1;
      if (taking) {
        const candidates = possible(to);
        let payoff = 0, cleared = 0;
        for (const rank of candidates) {
          const result = R.challenge(mine, rank);
          if (result !== "defend") cleared++;
          if (rank === "flag") payoff += 160;
          else if (result === "attack") payoff += 8 + value[rank];
          else if (result === "both") payoff += 2 + value[rank] - value[mine];
          else payoff -= mine === "flag" ? 600 : 3 + value[mine];
        }
        success = cleared / candidates.length;
        score += payoff / candidates.length;
        // An unidentified piece that just reached our back row might win on this reply.
        if (lastEnemy?.side === enemy && lastEnemy.to === to && R.row(to) === R.farRow(enemy)) {
          score += 80 * success;
        }
      }
      if (mine === "flag") {
        if (!taking && front(to) === 0 && !exposed.length) score += 1000;
        if (threats.length && !exposed.length && !taking) score += 125;
        if (exposed.length) score -= 95;
        if (!taking && !exposed.length) score += (front(from) - front(to)) * (foes.length < 9 ? 7 : 1.2);
      } else {
        if (threats.includes(to)) score += 78 * success;
        if (exposed.length && !taking) {
          const risk = Math.max(...exposed.map(i => {
            const candidates = possible(i);
            return candidates.filter(rank => R.challenge(rank, mine) !== "defend").length / candidates.length;
          }));
          score -= risk * value[mine] * 0.55;
        }
      }
      if (!taking) {
        if (recent.at(-1)?.to === from && recent.at(-1)?.from === to) score -= 8;
        score -= 4 * recent.filter(e => e.to === to && e.from === from).length;
      }
      if (score > bestScore) { bestScore = score; best = action; }
    }
    return best;
  }
  function acceptsDraw(view) {
    const onBoard = view.board.filter(Boolean).length;
    return onBoard === 2 || (view.history.length >= 40 && view.history.slice(-40).every(e => e.verdict === "quiet"));
  }
  return Object.freeze({chooseMove, acceptsDraw});
})();
if (typeof module !== "undefined" && module.exports) module.exports = SalpakanAI;
