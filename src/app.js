"use strict";

(() => {
  const R = Salpakan, AI = SalpakanAI, id = name => document.getElementById(name);
  const caps = value => value[0].toUpperCase() + value.slice(1);
  const glyph = rank => {
    if (rank.startsWith("g")) return "★";
    return {col:"✶",ltc:"✷",maj:"✦",cpt:"▥",lt1:"Ⅱ",lt2:"Ⅰ",sgt:"≋",pvt:"⌃",spy:"◈",flag:"⚑"}[rank];
  };
  const verdicts = {quiet:"Moved", attack:"Attacker holds", defend:"Defender holds", both:"Both removed"};
  const endings = {capture:"The opposing Flag was captured.", breakthrough:"The Flag reached the far row safely.",
    agreement:"Both sides agreed to a draw.", repetition:"The same position and turn occurred three times.",
    resignation:"The opposing player resigned."};
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  function button(label, fn, cls = "outline") {
    const b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  }

  let g = null, viewer = R.IVORY, selected = null, cover = null, note = "", timer = null;
  let draft = null, brush = null;
  let focusSquare = 18;
  const mount = id("board-mount"), actions = id("actions");
  const phase = () => g.phase === "setup" ? "Deployment" : g.phase === "over" ? "Match finished" : "In play";
  function report(s) { id("live").textContent = s; }
  function modalOpen() { return Boolean(document.querySelector("dialog[open]")); }
  const picker = id("settings");
  function showPickerStep(step) {
    const pickMode = step === "mode";
    id("mode-step").hidden = !pickMode;
    id("difficulty-step").hidden = pickMode;
    id("settings-title").textContent = pickMode ? "Choose a game mode" : "Choose AI difficulty";
    if (!picker.open) picker.showModal();
    picker.scrollTop = 0;
    (pickMode ? id("mode-ai") : picker.querySelector("[data-difficulty]")).focus({preventScroll:true});
  }
  function chooseSettings(step = "mode") {
    clearTimeout(timer); timer = null;
    id("first").value = g?.settings.first ?? R.IVORY;
    id("open-ranks").checked = g?.settings.open ?? false;
    id("tournament").checked = g?.settings.tournament ?? false;
    id("match-options").open = false;
    id("return-match").hidden = !g;
    id("replace-note").hidden = !g || g.phase === "over";
    showPickerStep(step);
  }
  function startFromPicker(mode, difficulty) {
    const settings = {mode, difficulty, first:id("first").value, open:id("open-ranks").checked,
      tournament:id("tournament").checked};
    picker.close();
    start(settings);
  }
  function backFromPicker() {
    if (!id("difficulty-step").hidden) showPickerStep("mode");
    else if (g) picker.close();
  }
  function start(settings) {
    clearTimeout(timer); timer = null;
    draft = null; brush = null;
    g = R.newGame(settings); viewer = R.IVORY; selected = null; note = ""; focusSquare = 18;
    cover = settings.mode === "duo" ? {kind:"pass", side:R.IVORY} : null;
    document.body.removeAttribute("data-launch");
    render(); report("New match. Ivory arranges first.");
    (cover ? mount : actions).querySelector("button").focus({preventScroll:true});
  }
  function pass(side) {
    selected = null;
    if (g.settings.mode === "duo") cover = {kind:"pass", side};
    else { cover = null; viewer = R.IVORY; }
  }
  function nextTurn() {
    if (g.phase === "over") { cover = null; viewer = g.settings.mode === "solo" ? R.IVORY : null; }
    else pass(g.turn);
    render();
  }
  function makeMove(side, from, to) {
    const event = R.move(g, side, from, to);
    selected = null; note = ""; focusSquare = to;
    const reveal = R.revealedChallenge(g);
    if (reveal) {
      cover = {kind:"challenge", reveal}; render();
    } else nextTurn();
    report(caps(side) + " " + R.coord(from) + " to " + R.coord(to) + ". " + verdicts[event.verdict] + ".");
  }
  function scheduleAI() {
    clearTimeout(timer); timer = null;
    if (!g || g.settings.mode !== "solo" || g.phase !== "play" || g.turn !== R.PINE || g.drawOffer || cover || modalOpen()) return;
    const match = g;
    timer = setTimeout(() => {
      if (g !== match || g.phase !== "play" || g.turn !== R.PINE || cover || modalOpen()) return;
      const move = AI.chooseMove(R.viewFor(g, R.PINE), Math.random, g.settings.difficulty);
      if (move) makeMove(R.PINE, move.from, move.to);
    }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 20 : 480);
  }
  function lock() {
    const side = g.setupSide;
    R.seal(g, side);
    if (g.settings.mode === "solo" && g.phase === "setup") R.seal(g, R.PINE);
    selected = null; note = "";
    pass(g.phase === "setup" ? g.setupSide : g.turn);
    render(); report("Formation locked.");
  }
  function draw() {
    R.offerDraw(g, viewer); selected = null;
    if (g.settings.mode === "duo") { cover = {kind:"offer", side:R.other(viewer)}; render(); return; }
    const accept = AI.acceptsDraw(R.viewFor(g, R.PINE));
    R.answerDraw(g, R.PINE, accept);
    note = accept ? "" : "The computer declined. It is still your turn.";
    render(); report(note || "Draw by agreement.");
  }
  function square(i) {
    if (cover || !viewer || g.phase === "over" || (g.phase === "play" && viewer !== g.turn)) return;
    if (draft) {
      if (!R.home(viewer,i)) note = "Choose a square in your three home rows.";
      else {
        draft[i] = brush;
        focusSquare = i;
        if (brush && remaining(brush) === 0) brush = R.ranks.find(r=>remaining(r.id)>0)?.id ?? null;
        note = "";
      }
      render(); report(id("guidance").textContent); return;
    }
    const piece = R.viewFor(g, viewer).board[i];
    note = "";
    if (i === selected) selected = null;
    else if (g.phase === "setup") {
      if (selected !== null && R.home(viewer, i)) { R.arrange(g, viewer, selected, i); selected = null; }
      else if (piece?.side === viewer) selected = i;
      else note = "Arrange pieces inside your three home rows.";
    } else if (piece?.side === viewer) selected = i;
    else if (selected !== null && R.targets(R.viewFor(g,viewer).board, viewer, selected).includes(i)) {
      makeMove(viewer, selected, i); return;
    } else note = selected === null ? "Choose one of your own pieces first." : "Choose a marked square next to your piece.";
    focusSquare = i;
    render(); report(id("guidance").textContent);
  }
  function remaining(rank) {
    return R.byId[rank].count - draft.filter(piece=>piece === rank).length;
  }
  function manualControls(placed) {
    const tray = el("select");
    tray.setAttribute("aria-label","Piece to place");
    for (const r of R.ranks) {
      const left = remaining(r.id);
      if (left) tray.add(new Option(r.name+" ("+left+" left)",r.id));
    }
    tray.add(new Option("Remove a piece",""));
    tray.value = brush ?? "";
    tray.onchange = ()=>{ brush=tray.value || null; note=""; };
    const finish = button("Use formation",()=>{
      R.deploy(g,viewer,draft); draft=null; note="Manual formation ready."; render(); report(note);
    },"primary");
    finish.disabled = placed !== 21;
    actions.append(tray,finish,button("Cancel placement",()=>{
      draft=null; note="Previous formation restored."; render(); report(note);
    }));
  }
  function axes(values, cls) {
    const a = el("div", cls);
    a.setAttribute("aria-hidden","true");
    for (const v of values) a.append(el("span","",v));
    return a;
  }
  function board(view) {
    const reversed = viewer === R.PINE, rows = Array.from({length:8},(_,i)=>reversed ? i : 7-i);
    const files = Array.from({length:9},(_,i)=>reversed ? 8-i : i);
    const wrap = el("div","board-wrap"), grid = el("div","field-grid");
    grid.setAttribute("role","group"); grid.setAttribute("aria-label","Game board");
    const letters = files.map(x=>String.fromCharCode(65+x)), nums = rows.map(x=>String(x+1));
    wrap.append(axes(letters,"files top"),axes(nums,"numbers left"),grid,axes(nums,"numbers right"),axes(letters,"files foot"));
    const legal = selected !== null && g.phase === "play" ? R.targets(view.board,viewer,selected) : [];
    const last = view.history.at(-1);
    for (const r of rows) for (const f of files) {
      const i = r*9+f, piece = view.board[i], cell = el("button","cell");
      cell.type = "button"; cell.dataset.cell = i; cell.tabIndex = i === focusSquare ? 0 : -1;
      if ((r+f)%2) cell.classList.add("alt");
      if (last && (last.from === i || last.to === i)) cell.classList.add("last");
      if (i === selected) cell.classList.add("selected");
      if (legal.includes(i)) cell.classList.add("legal");
      let label = R.coord(i) + ", empty";
      if (piece) {
        const own = piece.rank !== null, name = own ? R.byId[piece.rank].name : "concealed piece";
        label = R.coord(i) + ", " + caps(piece.side) + " " + name;
        cell.classList.add("occupied");
        const token = el("span","piece " + piece.side + (own ? "" : " back"));
        token.setAttribute("aria-hidden","true");
        token.append(el("span","insignia",own ? glyph(piece.rank) : "✥"));
        if (own) token.append(el("code","",R.byId[piece.rank].short));
        cell.append(token);
      }
      cell.setAttribute("aria-label",label);
      cell.setAttribute("aria-pressed",String(selected === i));
      grid.append(cell);
    }
    if (g.phase === "setup") {
      const band = el("div","seal-band"); band.setAttribute("aria-hidden","true");
      band.append(el("span","","Opponent’s formation is concealed")); grid.append(band);
    }
    return wrap;
  }
  function curtain() {
    const c = el("section","curtain");
    c.append(el("div","crest","✥"));
    if (cover.kind === "pass") {
      const side = cover.side;
      c.append(el("h2","","Pass to " + caps(side)),el("p","","Only the named player should see the next board."),
        button("Reveal " + caps(side) + " board",()=>{
          viewer = side; cover = null; focusSquare = side === R.IVORY ? 18 : 53; render(); report(caps(side)+" board revealed.");
        }));
    } else if (cover.kind === "offer") {
      const side = cover.side;
      c.append(el("h2","",caps(side) + ", accept a draw?"),el("p","","Pass the device to " + caps(side) + " to answer."));
      for (const [label,accept] of [["Accept draw",true],["Decline draw",false]]) {
        c.append(button(label,()=>{
          R.answerDraw(g, side, accept);
          note = accept ? "" : "Draw declined. The player who offered still has the turn.";
          nextTurn();
        }));
      }
    } else {
      const e = cover.reveal;
      c.append(el("h2","","Challenge revealed"),
        el("p","",caps(e.side)+" "+R.byId[e.attacker].name+" against "+caps(R.other(e.side))+" "+R.byId[e.defender].name+". "+verdicts[e.verdict]+"."),
        button("Conceal ranks & continue",nextTurn));
    }
    return c;
  }
  function setSideLabel(node, side, label) {
    node.replaceChildren(el("i","swatch " + side),document.createTextNode(label));
  }
  function log(history) {
    const container = id("moves-log");
    if (!history.length) { container.replaceChildren(el("p","log-empty","The first move will appear here.")); return; }
    const list = el("ol","log-list"); list.reversed = true;
    for (let n=history.length-1;n>=0;n--) {
      const e=history[n], item=el("li"), detail=el("div");
      detail.append(el("b","",R.coord(e.from)+" → "+R.coord(e.to)),el("small","",caps(e.side)+" · "+verdicts[e.verdict]));
      item.append(el("span","",String(n+1)),detail); list.append(item);
    }
    container.replaceChildren(list);
  }
  function render() {
    id("back-setup").hidden = g.phase !== "setup";
    const wasBoard = mount.contains(document.activeElement);
    const view = R.viewFor(g,cover ? null : viewer);
    if (draft && !cover) view.board = draft.map(rank=>rank ? {side:viewer,rank} : null);
    mount.replaceChildren(cover ? curtain() : board(view));
    if (wasBoard) {
      const next = cover ? mount.querySelector(".curtain button") : mount.querySelector('[tabindex="0"]');
      next?.focus({preventScroll:true});
    }
    const bottom = !cover && viewer ? viewer : R.IVORY, top = R.other(bottom);
    setSideLabel(id("opponent-label"),top,caps(top) + (g.settings.mode === "solo" && top === R.PINE ? " · Computer" : ""));
    setSideLabel(id("player-label"),bottom,caps(bottom) + (g.settings.mode === "solo" ? " · You" : ""));
    id("mode-label").textContent = g.settings.mode === "solo" ? "Vs computer · " + caps(g.settings.difficulty) : "Local two-player";
    id("turn-label").textContent = g.phase === "play" ? "Move " + (g.history.length+1) : phase();
    id("phase-label").textContent = phase();
    let heading, help;
    actions.replaceChildren();
    if (cover) {
      heading = cover.kind === "challenge" ? "Challenge result" : "Board concealed";
      help = cover.kind === "challenge" ? "Both players may view this result before continuing." : "Your pieces will appear after the handoff.";
    } else if (g.phase === "over") {
      heading = g.result.winner ? caps(g.result.winner)+" wins" : "Match drawn";
      help = endings[g.result.reason];
      actions.append(button("Play again",()=>start({...g.settings}),"primary"),button("Change settings",()=>chooseSettings()));
    } else if (draft) {
      const placed = draft.filter(Boolean).length;
      heading = "Manual placement · "+placed+"/21";
      help = "Choose a piece, then tap a home square. Replacing a piece returns it to the list.";
      manualControls(placed);
    } else if (g.phase === "setup") {
      heading = "Set your formation"; help = "Select a piece, then a home square to move or swap it. Lock when all 21 are where you want them.";
      actions.append(button("Lock formation",lock,"primary"),button("Manual placement",()=>{
        draft=Array(R.SIZE).fill(null); brush=R.ranks[0].id; selected=null; note=""; render();
        actions.querySelector("select").focus(); report(id("guidance").textContent);
      }),button("Shuffle",()=>{
        R.shuffle(g,viewer); selected=null; note="Formation shuffled."; render(); report(note);
      }),button("Arrange by rank",()=>{
        const squares = [...mount.querySelectorAll("[data-cell]")].map(c=>Number(c.dataset.cell))
          .filter(i=>g.board[i]?.side === viewer);
        const ordered = squares.map(i=>g.board[i].rank).sort((a,b)=>R.byId[a].order-R.byId[b].order);
        squares.forEach((to,n)=>{
          if (g.board[to].rank === ordered[n]) return;
          const from = squares.slice(n+1).find(i=>g.board[i].rank === ordered[n]);
          R.arrange(g,viewer,from,to);
        });
        selected=null; note="Formation ordered from the top left. Spies and Flag come last."; render(); report(note);
      }));
    } else {
      const thinking = g.settings.mode === "solo" && g.turn === R.PINE;
      heading = thinking ? "Computer’s turn" : caps(g.turn)+" to move";
      help = thinking ? "Pine is choosing a move." : "Select a piece, then choose a marked square to move or challenge.";
      if (!thinking) actions.append(button("Offer draw",draw),button("Resign",()=>id("confirm").showModal()));
    }
    if (!cover && selected !== null) {
      const p = view.board[selected];
      help = R.byId[p.rank].name+" on "+R.coord(selected)+". "+(g.phase==="setup" ? "Choose a home square." :
        R.targets(view.board,viewer,selected).length ? "Choose a marked square." : "This piece has no legal moves.");
    }
    id("phase-heading").textContent=heading;
    id("guidance").textContent=note && !cover ? note : help;
    log(view.history);
    scheduleAI();
  }
  mount.addEventListener("click", e=>{
    const cell = e.target.closest("[data-cell]"); if (cell) square(Number(cell.dataset.cell));
  });
  mount.addEventListener("keydown",e=>{
    const cell = e.target.closest("[data-cell]"); if (!cell) return;
    const i = Number(cell.dataset.cell);
    const deltas = {ArrowLeft:-1, ArrowRight:1, ArrowUp:9, ArrowDown:-9};
    if (e.key === "Escape") { selected=null; note=""; render(); return; }
    if (!(e.key in deltas)) return;
    e.preventDefault();
    const j = i + deltas[e.key] * (viewer===R.PINE ? -1 : 1);
    if (!R.neighbors(i).includes(j)) return;
    focusSquare=j; cell.tabIndex=-1; const next=mount.querySelector('[data-cell="'+j+'"]'); next.tabIndex=0; next.focus();
  });
  id("new-top").addEventListener("click",()=>chooseSettings());
  id("back-setup").addEventListener("click",()=>chooseSettings(g.settings.mode === "solo" ? "difficulty" : "mode"));
  id("mode-ai").addEventListener("click",()=>showPickerStep("difficulty"));
  id("mode-duo").addEventListener("click",()=>startFromPicker("duo"));
  for (const b of picker.querySelectorAll("[data-difficulty]")) {
    b.addEventListener("click",()=>startFromPicker("solo",b.dataset.difficulty));
  }
  id("back-mode").addEventListener("click",()=>showPickerStep("mode"));
  id("return-match").addEventListener("click",()=>picker.close());
  picker.addEventListener("keydown",e=>{
    if (e.key !== "Escape") return;
    e.preventDefault();
    if (!e.repeat) backFromPicker();
  });
  picker.addEventListener("cancel",e=>{ e.preventDefault(); backFromPicker(); });
  for (const key of ["rules-top","rules-side"]) id(key).addEventListener("click",()=>id("rulebook").showModal());
  for (const b of document.querySelectorAll("dialog .close")) b.addEventListener("click",()=>b.closest("dialog").close());
  id("cancel-resign").addEventListener("click",()=>id("confirm").close());
  id("do-resign").addEventListener("click",()=>{ R.resign(g,viewer); note=""; id("confirm").close(); nextTurn(); });
  for (const d of document.querySelectorAll("dialog")) d.addEventListener("close",scheduleAI);
  for (const r of R.ranks) {
    const item=el("li"); item.append(el("span","",(r.order < 13 ? (r.order+1)+". " : "Special · ")+r.name),el("strong","","×"+r.count)); id("ranks-list").append(item);
  }
  chooseSettings();
})();
