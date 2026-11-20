"use strict";

const SalpakanAI = (() => {
  const R = typeof module !== "undefined" && module.exports ? require("./rules.js") : Salpakan;
  const pool = R.ranks.flatMap(rank => Array(rank.count).fill(rank.id));
  const value = {g5:12, g4:11, g3:10, g2:9, g1:8, col:7, ltc:6, maj:5, cpt:5,
    lt1:4, lt2:4, sgt:3, pvt:4, spy:10, flag:120};
  const distance = (a, b) => Math.abs(R.file(a) - R.file(b)) + Math.abs(R.row(a) - R.row(b));

  // Follow concealed survivors using only movement and the ranks of our own casualties.
  function beliefs(view, casualties) {
    const known = new Map();
    for (const e of view.history) {
      const enemyMoves = e.side !== view.side;
      const candidates = known.get(enemyMoves ? e.from : e.to) || pool;
      if (casualties && e.verdict !== "quiet") {
        const eliminated = e.verdict === "both" || e.verdict === (enemyMoves ? "defend" : "attack");
        if (eliminated) {
          const matches = e.otherRank ? [e.otherRank] : candidates.filter(rank =>
            (enemyMoves ? R.challenge(rank, e.ownRank) : R.challenge(e.ownRank, rank)) === e.verdict);
          if (matches.length && matches.every(rank => rank === matches[0])) {
            const rank = matches[0];
            casualties.set(rank, (casualties.get(rank) || 0) + 1);
          }
        }
      }
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
  function practiceMove(view, random) {
    const {board, side} = view;
    let choice = null, best = -Infinity;
    for (const action of R.moves(board, side)) {
      const {from, to} = action;
      const forward = Math.abs(R.row(from) - R.farRow(side)) - Math.abs(R.row(to) - R.farRow(side));
      const isFlag = board[from].rank === "flag";
      const enemyNext = R.neighbors(to).some(i => board[i]?.side === R.other(side));
      let score = random() * 18 + forward * 2;
      if (board[to]) score += isFlag ? -22 : 5;
      if (isFlag && enemyNext) score -= 12;
      if (isFlag && !board[to] && !enemyNext && R.row(to) === R.farRow(side)) score += 50;
      if (score > best) { choice = action; best = score; }
    }
    return choice;
  }

  // Give identified survivors their copies before estimating unknown pieces.
  function remainingRanks(known, casualties, foes) {
    const remaining = new Map(R.ranks.map(r => [r.id, r.count - (casualties.get(r.id) || 0)]));
    const identified = new Map();
    for (const i of foes) {
      const options = known.get(i);
      if (options?.length && options.every(rank => rank === options[0])) {
        identified.set(i, [options[0]]);
        remaining.set(options[0], remaining.get(options[0]) - 1);
      }
    }
    const unseen = R.ranks.flatMap(r => Array(Math.max(0, remaining.get(r.id))).fill(r.id));
    const result = new Map();
    for (const i of foes) {
      const observed = known.get(i) || pool;
      const plausible = unseen.filter(rank => observed.includes(rank));
      result.set(i, identified.get(i) || (plausible.length ? plausible : observed));
    }
    return result;
  }

  // Model the strongest adjacent recapture after a candidate move. If our piece
  // survives, nearby friends can make trading for it unattractive to the opponent.
  function replyCost(board, side, from, to, mine, possible, survives) {
    if (!survives) return 0;
    const adjacent = R.neighbors(to);
    const guards = adjacent.filter(i => i !== from && board[i]?.side === side);
    let worst = 0;
    for (const square of adjacent.filter(i => board[i]?.side === R.other(side))) {
      const candidates = possible(square);
      let score = 0;
      for (const rank of candidates) {
        const result = R.challenge(rank, mine);
        if (result === "defend") continue;
        if (mine === "flag") { score += 180; continue; }
        const canRetake = result === "both" || guards.some(i => R.challenge(board[i].rank, rank) !== "defend");
        score += Math.max(0, value[mine] - (canRetake ? value[rank] : 0));
      }
      worst = Math.max(worst, score / candidates.length);
    }
    return worst * survives;
  }

  // Distance through vacant, currently unguarded squares to a winning back-row square.
  // A sideways move can be the quickest safe way around a wall of pieces.
  function flagRoute(board, side, flag) {
    const safe = board.map((piece, i) => (i === flag || !piece) &&
      !R.neighbors(i).some(n => board[n]?.side === R.other(side)));
    const distanceToGoal = Array(board.length).fill(Infinity);
    const queue = [];
    for (let i = 0; i < board.length; i++) {
      if (safe[i] && R.row(i) === R.farRow(side)) {
        distanceToGoal[i] = 0;
        queue.push(i);
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const here = queue[head];
      for (const next of R.neighbors(here)) {
        if (safe[next] && !Number.isFinite(distanceToGoal[next])) {
          distanceToGoal[next] = distanceToGoal[here] + 1;
          queue.push(next);
        }
      }
    }
    return distanceToGoal;
  }

  function chooseMove(view, random = Math.random, difficulty = "medium") {
    if (view.phase !== "play" || view.turn !== view.side) return null;
    if (difficulty === "easy") return practiceMove(view, random);
    const hard = difficulty === "hard";
    const {board, side, history} = view, enemy = R.other(side);
    const foes = board.flatMap((p, i) => p?.side === enemy ? [i] : []);
    const flag = board.findIndex(p => p?.side === side && p.rank === "flag");
    const casualties = hard ? new Map() : null;
    const route = hard ? flagRoute(board, side, flag) : null;
    const known = beliefs(view, casualties);
    const ranks = hard ? remainingRanks(known, casualties, foes) : known;
    const possible = i => foes.length === 1 ? ["flag"] : ranks.get(i) || pool;
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
      let success = 1, survives = 1;
      if (taking) {
        const candidates = possible(to);
        let payoff = 0, cleared = 0, live = 0;
        for (const rank of candidates) {
          const result = R.challenge(mine, rank);
          if (result !== "defend") cleared++;
          if (result === "attack" && rank !== "flag") live++;
          if (rank === "flag") payoff += 160;
          else if (result === "attack") payoff += 8 + value[rank];
          else if (result === "both") payoff += 2 + value[rank] - value[mine];
          else payoff -= mine === "flag" ? 600 : 3 + value[mine];
        }
        success = cleared / candidates.length;
        survives = live / candidates.length;
        score += payoff / candidates.length;
        // An unidentified piece that just reached our back row might win on this reply.
        if (lastEnemy?.side === enemy && lastEnemy.to === to && R.row(to) === R.farRow(enemy) && candidates.includes("flag")) {
          // Any non-Flag wins against a Flag. Missing that one reply would end the match.
          score += mine === "flag" ? 80 * success : 260;
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
      if (hard) {
        score -= 2.6 * replyCost(board, side, from, to, mine, possible, survives);
        if (mine === "flag" && !taking && !exposed.length) {
          const advance = front(from) - front(to);
          const nearest = near(to);
          score += advance * (nearest >= 3 ? 6 : 2);
          if (Number.isFinite(route[to])) {
            const gaining = route[to] < route[from];
            score += gaining ? 19 + 30 / (1 + route[to]) : -8;
          }
        }
        // A vacant escape square behind our Flag can matter more than closing ranks.
        if (mine !== "flag" && !taking && R.neighbors(flag).includes(to) && near(flag) <= 2) {
          const escapes = R.neighbors(flag).filter(i => i !== to && (!board[i] || i === from));
          if (!escapes.length) score -= 9;
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
