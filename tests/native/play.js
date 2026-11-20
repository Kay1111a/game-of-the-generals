/* Loaded only by the native test harnesses. Play using controls and public information. */
async function playNativeMatches() {
  const report = {matches:[], active:"starting"};
  window.nativePlaytest = report;
  const find = selector => document.querySelector(selector);
  const cells = () => [...document.querySelectorAll("[data-cell]")];
  const cell = i => find('[data-cell="' + i + '"]');
  const heading = () => find("#phase-heading").textContent;
  const check = (value, message) => { if (!value) throw Error(report.active + ": " + message); };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(predicate, description) {
    for (let n=0; n<240; n++) {
      if (predicate()) return;
      await pause(25);
    }
    throw Error(report.active + ": timed out waiting for " + description + " (" + heading() + ")");
  }
  function action(label) {
    const b = [...document.querySelectorAll("button")].find(e => e.getClientRects().length && e.textContent.trim() === label);
    check(b, "missing button " + label);
    b.click();
  }
  function settings(mode, difficulty) {
    if (!find("#settings").open) find("#new-top").click();
    check(find("#settings").open && !find("#mode-step").hidden && find("#difficulty-step").hidden,
      "new match must ask for the mode first");
    const visiblePieces = document.querySelectorAll(".piece").length;
    find("#mode-" + (mode === "solo" ? "ai" : "duo")).click();
    if (mode === "solo") {
      check(find("#settings").open && find("#mode-step").hidden && !find("#difficulty-step").hidden,
        "selecting AI must show a separate difficulty step");
      check(document.querySelectorAll(".piece").length === visiblePieces, "AI started before difficulty was chosen");
      find('[data-difficulty="' + difficulty + '"]').click();
      check(cells().length === 72 && heading() === "Set your formation", "solo deployment");
    } else {
      check(!cells().length && find(".curtain h2").textContent === "Pass to Ivory", "two-player private start");
    }
    check(!find("#settings").open, "picker still open after the final choice");
  }
  function reveal(side) {
    check(cells().length === 0 && !find(".piece"), "handoff exposed pieces");
    action("Reveal " + side + " board");
    check(cells().length === 72, "board size after reveal");
  }
  function place(side, rank, to) {
    const own = cells().find(c => c.getAttribute("aria-label").endsWith(", " + side + " " + rank));
    check(own, "missing " + rank);
    if (Number(own.dataset.cell) !== to) { own.click(); cell(to).click(); }
  }
  function move(from,to) {
    cell(from).click();
    check(cell(to).classList.contains("legal"), "unmarked destination " + from + "/" + to);
    cell(to).click();
  }
  const rankIds = new Map(Salpakan.ranks.map(r => [r.name,r.id]));
  function readBoard() {
    const board = Array(72).fill(null);
    for (const c of cells()) {
      const [, description] = c.getAttribute("aria-label").split(", ");
      if (description === "empty") continue;
      const split = description.indexOf(" ");
      const side = description.slice(0,split).toLowerCase(), title = description.slice(split+1);
      board[Number(c.dataset.cell)] = {side, rank:title === "concealed piece" ? null : rankIds.get(title)};
    }
    return board;
  }
  const coord = s => (Number(s.slice(1))-1)*9 + s.charCodeAt(0)-65;
  function addHistory(history, own) {
    const rows = [...document.querySelectorAll(".log-list li")].reverse().slice(history.length);
    const outcomes = {"Moved":"quiet","Attacker holds":"attack","Defender holds":"defend","Both removed":"both"};
    for (const li of rows) {
      const [from,to] = li.querySelector("b").textContent.split(" → ").map(coord);
      const [player,outcome] = li.querySelector("small").textContent.split(" · ");
      const side = player.toLowerCase(), verdict = outcomes[outcome];
      const rank = own.get(side === "ivory" ? from : to);
      const event = {side,from,to,verdict};
      if (verdict !== "quiet") { check(rank,"missing own challenge observation"); event.ownRank=rank; }
      if (side === "ivory") {
        own.delete(from);
        if (verdict === "quiet" || verdict === "attack") own.set(to,rank);
      } else if (verdict === "both" || verdict === "attack") own.delete(to);
      history.push(event);
    }
  }
  const actualRandom = Math.random;
  try {
    check(find("#settings").open && !find("#mode-step").hidden && find("#difficulty-step").hidden,
      "fresh launch must show only the mode choices");
    check(!cells().length && !find(".piece") && !find(".log-list li"), "unexpected match at launch");
    find("#mode-ai").click();
    check(!find("#difficulty-step").hidden && !cells().length, "first AI choice started too soon");
    find("#back-mode").click();
    check(!find("#mode-step").hidden && !cells().length, "back should preserve the fresh menu");
    for (const level of ["easy","medium","hard"]) {
      report.active = level;
      let seed = 3;
      Math.random = () => ((seed = (Math.imul(seed,1664525)+1013904223) >>> 0) / 2**32);
      settings("solo",level);
      check(find("#mode-label").textContent.toLowerCase().includes(level), "wrong level displayed");
      action("Lock formation");
      check(document.querySelectorAll(".back").length === 21,"enemy setup visibility");
      const history=[], own=new Map();
      readBoard().forEach((p,i) => { if (p?.side === "ivory") own.set(i,p.rank); });
      for (let round=0; round<500; round++) {
        await until(()=>heading()!=="Computer’s turn","computer reply");
        if (find("#phase-label").textContent === "Match finished") break;
        check(heading()==="Ivory to move","player turn");
        addHistory(history,own);
        const view={board:readBoard(),history,side:"ivory",turn:"ivory",phase:"play"};
        const selected=SalpakanAI.chooseMove(view,()=>0.43);
        move(selected.from,selected.to);
      }
      check(find("#phase-label").textContent==="Match finished","match never finished");
      check(find("#guidance").textContent.includes("Flag"),"natural victory");
      report.matches.push({mode:level,plies:document.querySelectorAll(".log-list li").length,result:heading()});
      action("Play again");
      check(find("#mode-label").textContent.toLowerCase().includes(level) && !find(".log-list li"),"replay reset");
    }
    report.active="local two-player";
    settings("duo");
    reveal("Ivory"); place("Ivory","Flag",18); action("Lock formation");
    reveal("Pine"); place("Pine","Flag",45); place("Pine","Sergeant",53); action("Lock formation");
    reveal("Ivory");
    for (const [from,to,next] of [[18,27,"Pine"],[53,44,"Ivory"],[27,36,"Pine"],[44,53,"Ivory"],[36,45,null]]) {
      move(from,to); if (next) reveal(next);
    }
    check(heading()==="Ivory wins" && find("#guidance").textContent.includes("captured"), "Flag-on-Flag result");
    report.matches.push({mode:"two players",plies:5,result:heading()});
    report.externalResources = performance.getEntriesByType("resource")
      .filter(entry => /^https?:/.test(entry.name)).map(entry => entry.name);
    check(report.externalResources.length === 0, "external resource request");
    report.done=true;
  } catch (error) { report.error=String(error.stack || error); }
  finally { Math.random=actualRandom; }
  return report;
}
