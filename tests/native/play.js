async function playNativeMatches(){
 const report={matches:[],done:false};window.nativePlaytest=report;
 const check=(ok,msg)=>{if(!ok)throw Error(msg)};
 const press=text=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent===text&&e.getClientRects().length);check(b,text);b.click()};
 const random=Math.random,delay=window.setTimeout;
 try{
 let seed=812;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 window.setTimeout=(fn,ms,...args)=>delay(fn,ms===450?0:ms,...args);
 for(const [from,to] of Object.entries(shortcuts))check(landing(Number(from)-1,1)===to,'shortcut');
 check(landing(99,2)===99&&landing(99,1)===100,'finish');
 check(!retry('Easy',16,1,1)&&retry('Medium',16,1,1)&&!retry('Medium',99,2,1)&&retry('Hard',99,2,1),'strategies');
 for(const option of ['Easy','Medium','Hard','2 players','3 players','4 players']){
 if(game)press('New game');const local=option.endsWith('players');press(local?'Local players':'Player vs AI');press(option);
 check(game.pos.length===(local?parseInt(option):2),'players');let ticks=0;
 while(!game.over&&ticks++<7000){if(game.level&&game.i===1)await new Promise(r=>delay(r,10));else if(game.pending)press(game.left[0]===2?'Reroll':'Keep roll');else press('Roll die')}
 check(game.over&&game.pos[game.i]===100,'winner');report.matches.push(option);
 press('Play again');check(game.pos.every(n=>n===0),'reset')
 }
 report.done=true;
 }catch(e){report.error=String(e.stack||e)}finally{Math.random=random;window.setTimeout=delay}
}
