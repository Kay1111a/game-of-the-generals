"use strict";

// The arbiter owns the full position. Players, the UI and the AI use viewFor().
const Salpakan = (() => {
  const FILES = 9, ROWS = 8, SIZE = FILES * ROWS;
  const IVORY = "ivory", PINE = "pine";
  const ranks = [
    ["g5", "5-Star General", "5★", 1], ["g4", "4-Star General", "4★", 1],
    ["g3", "3-Star General", "3★", 1], ["g2", "2-Star General", "2★", 1],
    ["g1", "1-Star General", "1★", 1], ["col", "Colonel", "COL", 1],
    ["ltc", "Lieutenant Colonel", "LTC", 1], ["maj", "Major", "MAJ", 1],
    ["cpt", "Captain", "CPT", 1], ["lt1", "1st Lieutenant", "1LT", 1],
    ["lt2", "2nd Lieutenant", "2LT", 1], ["sgt", "Sergeant", "SGT", 1],
    ["pvt", "Private", "PVT", 6], ["spy", "Spy", "SPY", 2], ["flag", "Flag", "FLAG", 1],
  ].map(([id, name, short, count], order) => Object.freeze({id, name, short, count, order}));
  const byId = Object.freeze(Object.fromEntries(ranks.map(rank => [rank.id, rank])));
  const army = ranks.flatMap(rank => Array(rank.count).fill(rank.id));
  const other = side => side === IVORY ? PINE : IVORY;
  const row = index => Math.floor(index / FILES);
  const file = index => index % FILES;
  const valid = index => Number.isInteger(index) && index >= 0 && index < SIZE;
  const coord = index => String.fromCharCode(65 + file(index)) + (row(index) + 1);
  const home = (side, index) => valid(index) && (side === IVORY ? row(index) < 3 : row(index) >= 5);
  const farRow = side => side === IVORY ? ROWS - 1 : 0;
  const adjacent = Array.from({length: SIZE}, (_, index) =>
    [index - FILES, index + FILES, index - 1, index + 1].filter(next =>
      valid(next) && Math.abs(row(index) - row(next)) + Math.abs(file(index) - file(next)) === 1));
  const neighbors = index => valid(index) ? adjacent[index].slice() : [];
  const requireRule = (ok, message) => { if (!ok) throw new Error(message); };

  function challenge(attacker, defender) {
    requireRule(Object.hasOwn(byId, attacker) && Object.hasOwn(byId, defender), "Unknown rank.");
    if (defender === "flag") return "attack"; // Includes Flag against Flag.
    if (attacker === "flag") return "defend";
    if (attacker === defender) return "both";
    if (attacker === "spy") return defender === "pvt" ? "defend" : "attack";
    if (defender === "spy") return attacker === "pvt" ? "attack" : "defend";
    return byId[attacker].order < byId[defender].order ? "attack" : "defend";
  }

  function formation(board, side, random, guardFlag = false) {
    const cells = [...army, ...Array(6).fill(null)];
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    if (guardFlag) {
      const flag = cells.indexOf("flag");
      const rear = (side === IVORY ? 0 : 18) + Math.floor(random() * FILES);
      [cells[flag], cells[rear]] = [cells[rear], cells[flag]];
    }
    const offset = side === IVORY ? 0 : 5 * FILES;
    cells.forEach((rank, i) => { board[offset + i] = rank ? {side, rank} : null; });
  }

  function newGame(options = {}, random = Math.random) {
    const settings = {
      mode: options.mode === "duo" ? "duo" : "solo",
      first: [IVORY, PINE, "coin"].includes(options.first) ? options.first : IVORY,
      open: options.open === true, tournament: options.tournament === true,
    };
    const g = {
      settings, board: Array(SIZE).fill(null), phase: "setup", setupSide: IVORY,
      turn: null, pending: null, result: null, drawOffer: null,
      history: [], visits: new Map(),
    };
    formation(g.board, IVORY, random);
    formation(g.board, PINE, random, settings.mode === "solo");
    return g;
  }

  function assertSetup(g, side) {
    requireRule(g.phase === "setup" && side === g.setupSide, "This formation is already sealed or belongs to the other player.");
  }
  function shuffle(g, side, random = Math.random) {
    assertSetup(g, side);
    formation(g.board, side, random, side === PINE && g.settings.mode === "solo");
  }
  function arrange(g, side, from, to) {
    assertSetup(g, side);
    requireRule(home(side, from) && home(side, to) && g.board[from]?.side === side, "Use a piece and two squares in your home rows.");
    [g.board[from], g.board[to]] = [g.board[to], g.board[from]];
  }
  function seal(g, side, random = Math.random) {
    assertSetup(g, side);
    if (side === IVORY) {
      g.setupSide = PINE;
      return;
    }
    g.setupSide = null;
    g.phase = "play";
    g.turn = g.settings.first === "coin" ? (random() < 0.5 ? IVORY : PINE) : g.settings.first;
    notePosition(g);
  }

  function targets(board, side, from) {
    if (!valid(from) || board[from]?.side !== side) return [];
    return adjacent[from].filter(to => board[to]?.side !== side);
  }
  function moves(board, side) {
    const result = [];
    board.forEach((piece, from) => {
      if (piece?.side === side) for (const to of targets(board, side, from)) result.push({from, to});
    });
    return result;
  }
  function finish(g, winner, reason) {
    g.phase = "over";
    g.result = {winner, reason};
    g.turn = null;
    g.pending = null;
    g.drawOffer = null;
  }
  function notePosition(g) {
    if (!g.settings.tournament) return;
    const cells = g.board.map(piece => piece ? piece.side[0] + piece.rank : "").join(",");
    const key = [g.turn, g.pending?.square ?? "-", cells].join("|");
    const n = (g.visits.get(key) || 0) + 1;
    g.visits.set(key, n);
    if (n >= 3) finish(g, null, "repetition");
  }

  function move(g, side, from, to) {
    requireRule(g.phase === "play" && g.turn === side && !g.drawOffer, "Wait for your turn.");
    requireRule(targets(g.board, side, from).includes(to), "Move one square up, down, left or right onto an empty or opposing square.");
    const attacker = g.board[from], defender = g.board[to];
    const verdict = defender ? challenge(attacker.rank, defender.rank) : "quiet";
    const event = {side, from, to, verdict, attackRank: attacker.rank, defendRank: defender?.rank ?? null};
    g.history.push(event);
    g.board[from] = null;
    g.board[to] = verdict === "both" ? null : verdict === "defend" ? defender : attacker;
    if (defender) g.visits.clear();

    if (defender?.rank === "flag") finish(g, side, "capture");
    else if (attacker.rank === "flag" && verdict === "defend") finish(g, other(side), "capture");
    else if (g.pending) finish(g, g.pending.side, "breakthrough");
    else if (attacker.rank === "flag" && row(to) === farRow(side)) {
      if (adjacent[to].some(n => g.board[n]?.side === other(side))) g.pending = {side, square: to};
      else finish(g, side, "breakthrough");
    }
    if (g.phase === "play") {
      g.turn = other(side);
      notePosition(g);
    }
    return publicEvent(event);
  }

  function offerDraw(g, side) {
    requireRule(g.phase === "play" && g.turn === side && !g.drawOffer, "Only the active player can offer a draw.");
    g.drawOffer = side;
  }
  function answerDraw(g, side, accept) {
    requireRule(g.phase === "play" && g.drawOffer === other(side), "Only the other player can answer the offer.");
    g.drawOffer = null;
    if (accept) finish(g, null, "agreement");
  }
  function resign(g, side) {
    requireRule(g.phase === "play" && [IVORY, PINE].includes(side), "There is no active match.");
    finish(g, other(side), "resignation");
  }
  function publicEvent({side, from, to, verdict}) { return {side, from, to, verdict}; }

  function viewFor(g, side) {
    const board = g.board.map(piece => {
      if (!piece || (g.phase === "setup" && piece.side !== side)) return null;
      return {side: piece.side, rank: piece.side === side ? piece.rank : null};
    });
    const history = g.history.map(event => {
      const item = publicEvent(event);
      if (event.verdict !== "quiet" && side) {
        item.ownRank = event.side === side ? event.attackRank : event.defendRank;
        if (g.settings.open) item.otherRank = event.side === side ? event.defendRank : event.attackRank;
      }
      return item;
    });
    return {side, turn: g.turn, phase: g.phase, board, history};
  }
  function revealedChallenge(g) {
    const e = g.history.at(-1);
    if (!g.settings.open || !e || e.verdict === "quiet") return null;
    return {...publicEvent(e), attacker: e.attackRank, defender: e.defendRank};
  }
  return Object.freeze({FILES, ROWS, SIZE, IVORY, PINE, ranks: Object.freeze(ranks), byId, coord, row, file,
    home, farRow, other, neighbors, challenge, newGame, arrange, shuffle, seal, moves, targets,
    move, offerDraw, answerDraw, resign, viewFor, revealedChallenge});
})();

if (typeof module !== "undefined" && module.exports) module.exports = Salpakan;
