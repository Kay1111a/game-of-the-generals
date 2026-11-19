"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/rules.js");
const AI = require("../src/opponent.js");
const I = R.IVORY, P = R.PINE;
function seeded(seed) { return () => ((seed = (Math.imul(seed,1664525)+1013904223) >>> 0) / 2**32); }
function start(settings={}) {
  const g=R.newGame(settings,seeded(3)); R.seal(g,I); R.seal(g,P); return g;
}
function position(pieces,settings={}) {
  const g=start(settings); g.board.fill(null);
  for(const [i,side,rank] of pieces) g.board[i]={side,rank};
  g.visits.clear(); return g;
}
const opponents = ["g5","g4","g3","g2","g1","col","ltc","maj","cpt","lt1","lt2","sgt"];
const army = [...opponents,"pvt","pvt","pvt","pvt","pvt","pvt","spy","spy","flag"].sort();

test("9 by 8 deployment has 21 pieces and six free home squares per side for 50 formations",()=>{
  for(let seed=0;seed<50;seed++) {
    const g=R.newGame({},seeded(seed)); assert.equal(g.board.length,72);
    for(const side of [I,P]) {
      const me=g.board.map((p,i)=>p?.side===side ? i : null).filter(i=>i!==null);
      assert.deepEqual(me.map(i=>g.board[i].rank).sort(),army);
      assert.ok(me.every(i=>R.home(side,i)));
      assert.equal(g.board.filter((p,i)=>!p&&R.home(side,i)).length,6);
      assert.equal(R.viewFor(g,side).board.filter(Boolean).length,21);
    }
    assert.ok(g.board.slice(27,45).every(p=>p===null));
  }
});
test("free deployment can swap, move into a space and shuffle without crossing home rows or editing a sealed army",()=>{
  const g=R.newGame({mode:"duo"},seeded(11)); const occupied=g.board.map((p,i)=>p?.side===I?i:null).filter(i=>i!==null);
  const [a,b]=occupied, hole=g.board.findIndex(p=>!p), original={...g.board[a]};
  R.arrange(g,I,a,b); assert.deepEqual(g.board[b],original);
  R.arrange(g,I,b,hole); assert.deepEqual(g.board[hole],original); assert.equal(g.board[b],null);
  assert.throws(()=>R.arrange(g,I,hole,40)); const pine=JSON.stringify(g.board.slice(45));
  R.shuffle(g,I,seeded(20)); assert.equal(JSON.stringify(g.board.slice(45)),pine);
  R.seal(g,I); assert.throws(()=>R.arrange(g,I,a,b)); assert.throws(()=>R.shuffle(g,I));
  R.seal(g,P); assert.throws(()=>R.seal(g,P));
});
test("opening player honors both choices and both coin outcomes",()=>{
  for(const [first,roll,expected] of [[I,.9,I],[P,.1,P],["coin",.1,I],["coin",.9,P]]) {
    const g=R.newGame({first});R.seal(g,I);R.seal(g,P,()=>roll); assert.equal(g.turn,expected);
  }
});
test("all 225 ordered challenge pairings follow an independent win/loss table",()=>{
  const ranks=[...opponents,"pvt","spy","flag"];
  const beats=Object.fromEntries(opponents.map((rank,i)=>[rank,new Set([...opponents.slice(i+1),"pvt","flag"])]));
  beats.pvt=new Set(["spy","flag"]); beats.spy=new Set([...opponents,"flag"]); beats.flag=new Set(["flag"]);
  for(const a of ranks) for(const b of ranks) {
    const expected=beats[a].has(b)?"attack":a===b?"both":"defend";
    assert.equal(R.challenge(a,b),expected,a+" vs "+b);
  }
});
test("arbiter rejects unknown rank identifiers, including inherited object names",()=>{
  for (const unknown of ["missing","constructor","toString","__proto__"]) {
    assert.throws(()=>R.challenge(unknown,"flag")); assert.throws(()=>R.challenge("g5",unknown));
  }
});
test("all squares have only adjacent orthogonal targets and cannot wrap across a board edge",()=>{
  const g=position([]);
  for(let i=0;i<72;i++){g.board[i]={side:I,rank:"pvt"};
    const expected=Array.from({length:72},(_,x)=>x).filter(j=>Math.abs(i%9-j%9)+Math.abs(Math.floor(i/9)-Math.floor(j/9))===1);
    assert.deepEqual(R.targets(g.board,I,i).sort((a,b)=>a-b),expected);g.board[i]=null;
  }
});
test("wrong turn, diagonal, jump, friendly landing and pass leave state unchanged",()=>{
  const g=position([[8,I,"sgt"],[7,I,"pvt"],[9,P,"spy"]]);
  for(const [side,a,b] of [[P,9,10],[I,8,8],[I,8,9],[I,8,16],[I,8,26],[I,8,7],[I,8,-1]]) {
    const board=JSON.stringify(g.board); assert.throws(()=>R.move(g,side,a,b)); assert.equal(JSON.stringify(g.board),board);assert.equal(g.turn,I);assert.equal(g.history.length,0);
  }
});
test("attack, defense, equal losses and quiet movement leave the correct occupant",()=>{
  for(const [a,b,verdict,survivor] of [["pvt","spy","attack",I],["spy","pvt","defend",P],["sgt","sgt","both",null],["g4",null,"quiet",I]]) {
    const g=position(b?[[20,I,a],[29,P,b]]:[[20,I,a]]);
    assert.equal(R.move(g,I,20,29).verdict,verdict);assert.equal(g.board[20],null);assert.equal(g.board[29]?.side??null,survivor);assert.equal(g.turn,P);
  }
});
test("Flag challenges end the match immediately and play is then disabled",()=>{
  for(const [a,b,win] of [["flag","flag",I],["flag","pvt",P],["spy","flag",I]]) {
    const g=position([[20,I,a],[29,P,b]]); R.move(g,I,20,29);
    assert.deepEqual(g.result,{winner:win,reason:"capture"});assert.throws(()=>R.move(g,P,29,20));
  }
});
test("both colors can break through immediately, including when enemies are only diagonal",()=>{
  for(const [side,from,to,diagonal] of [[I,54,63,55],[P,10,1,9]]) {
    const g=position([[from,side,"flag"],[diagonal,R.other(side),"pvt"]],{first:side});
    R.move(g,side,from,to);assert.deepEqual(g.result,{winner:side,reason:"breakthrough"});
  }
});
test("a contested breakthrough allows exactly one reply, with capture taking priority",()=>{
  for(const [from,to,reason,winner] of [[65,64,"capture",P],[65,66,"breakthrough",I],[10,1,"capture",I]]) {
    const g=position([[55,I,"flag"],[65,P,"pvt"],[10,P,"flag"],[1,I,"cpt"]]);
    R.move(g,I,55,64);assert.equal(g.phase,"play");assert.equal(g.pending.square,64);
    R.move(g,P,from,to);assert.deepEqual(g.result,{winner,reason});
  }
});
test("standard arbiter conceals surviving ranks and off-turn views cannot mutate the game",()=>{
  const g=position([[20,I,"cpt"],[29,P,"spy"]]);R.move(g,I,20,29);
  const v=R.viewFor(g,I);assert.deepEqual(v.board[29],{side:P,rank:null});
  assert.equal(v.history[0].ownRank,"cpt");assert.equal(v.history[0].otherRank,undefined);assert.equal(R.revealedChallenge(g),null);
  assert.equal(JSON.stringify(v).includes('"spy"'),false);v.board[29].rank="flag";v.history[0].to=0;assert.equal(g.board[29].rank,"spy");assert.equal(g.history[0].to,29);
});
test("open variant announces only challenges and later re-conceals surviving pieces",()=>{
  const g=position([[20,I,"sgt"],[29,P,"spy"]],{open:true});R.move(g,I,20,29);
  assert.equal(R.revealedChallenge(g).attacker,"sgt");assert.equal(R.revealedChallenge(g).defender,"spy");
  assert.equal(R.viewFor(g,I).history[0].otherRank,"spy");assert.equal(R.viewFor(g,I).board[29].rank,null);
  R.move(g,P,29,30);assert.equal(R.revealedChallenge(g),null);
});
test("draw offers require opponent agreement, decline preserves turn, resignation awards opponent",()=>{
  const g=start();assert.throws(()=>R.offerDraw(g,P));R.offerDraw(g,I);assert.throws(()=>R.answerDraw(g,I,true));
  const a=R.moves(g.board,I)[0];assert.throws(()=>R.move(g,I,a.from,a.to));R.answerDraw(g,P,false);assert.equal(g.turn,I);
  R.offerDraw(g,I);R.answerDraw(g,P,true);assert.deepEqual(g.result,{winner:null,reason:"agreement"});
  const fresh=start();R.resign(fresh,I);assert.deepEqual(fresh.result,{winner:P,reason:"resignation"});
});
test("threefold is opt-in and counts positions with the same side to play",()=>{
  for(const tournament of [false,true]) {
    const g=position([[0,I,"flag"],[20,I,"pvt"],[70,P,"flag"],[49,P,"pvt"]],{tournament});
    for(let i=0;i<12&&g.phase==="play";i++){
      const [a,b]=[[20,21],[49,50],[21,20],[50,49]][i%4];R.move(g,g.turn,a,b);
    }
    assert.equal(g.result?.reason??null,tournament?"repetition":null);
  }
});
test("AI receives identical inputs and chooses identically after swapping unseen enemy identities",()=>{
  const g=start({first:P});const prior=R.viewFor(g,P),a=AI.chooseMove(prior,seeded(51));
  const [x,y]=[g.board.findIndex(p=>p?.side===I&&p.rank==="flag"),g.board.findIndex(p=>p?.side===I&&p.rank==="g5")];
  [g.board[x],g.board[y]]=[g.board[y],g.board[x]];const next=R.viewFor(g,P);
  assert.deepEqual(next,prior);assert.deepEqual(AI.chooseMove(next,seeded(51)),a);
  assert.equal(AI.chooseMove(R.viewFor(g,I)),null);
});
test("AI responds to a possible breakthrough using only the publicly seen move",()=>{
  const g=position([[55,I,"flag"],[12,I,"pvt"],[63,P,"flag"],[65,P,"sgt"]]);
  R.move(g,I,55,64);const view=R.viewFor(g,P);assert.equal(view.board[64].rank,null);
  const a=AI.chooseMove(view,()=>.5); R.move(g,P,a.from,a.to);
  assert.deepEqual(g.result,{winner:P,reason:"capture"});
});
test("AI takes a safe open goal and accepts a draw with just two Flags",()=>{
  const g=position([[54,I,"flag"],[24,P,"flag"]]);assert.deepEqual(AI.chooseMove(R.viewFor(g,I),()=>.5),{from:54,to:63});
  assert.equal(AI.acceptsDraw(R.viewFor(g,I)),true);assert.equal(AI.acceptsDraw(R.viewFor(start(),P)),false);
});
test("96 seeded computer matches finish, use legal moves, and conserve pieces at every turn",()=>{
  let captures=0,breakthroughs=0,draws=0,plies=0;
  for(let seed=1;seed<=96;seed++){
    const rng=seeded(seed),g=R.newGame({tournament:true,first:seed%2?I:P},rng);
    R.seal(g,I);R.seal(g,P);
    while(g.phase==="play"&&g.history.length<800){
      const v=R.viewFor(g,g.turn),action=AI.chooseMove(v,rng);assert.ok(action);
      assert.ok(R.targets(g.board,g.turn,action.from).includes(action.to));
      const before=g.board.filter(Boolean).length, e=R.move(g,g.turn,action.from,action.to);
      assert.equal(before-g.board.filter(Boolean).length,({quiet:0,both:2,attack:1,defend:1})[e.verdict]);
    }
    assert.equal(g.phase,"over","seed "+seed);plies+=g.history.length;
    if(g.result.reason==="capture")captures++;else if(g.result.reason==="breakthrough")breakthroughs++;else draws++;
  }
  assert.ok(captures&&breakthroughs);console.log("Self-play:",{games:96,plies,captures,breakthroughs,draws});
});
