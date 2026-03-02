import { useState, useEffect, useCallback, useRef } from "react";

/* ════════════════════════════════════════════════════════
   CONSTANTES
════════════════════════════════════════════════════════ */
const SUITS    = ["espadas","bastos","copas","oros"];
const VALS     = [1,2,3,4,5,6,7,10,11,12];
const SUIT_SYM = { espadas:"⚔", bastos:"🌿", copas:"🏆", oros:"●" };
const VNAME    = { 1:"Ancho",2:"Dos",3:"Tres",4:"Cuatro",5:"Cinco",6:"Seis",7:"Siete",10:"Sota",11:"Caballo",12:"Rey" };
const SUIT_ACCENT = {
  espadas: { bg:"#0d1f3c", border:"#4e8cff", num:"#7ab4ff", sym:"#4e8cff", glow:"rgba(78,140,255,.35)" },
  bastos:  { bg:"#0d2a14", border:"#4ecb71", num:"#7de899", sym:"#4ecb71", glow:"rgba(78,203,113,.35)" },
  copas:   { bg:"#2d0a20", border:"#e06ba8", num:"#f0a0cc", sym:"#e06ba8", glow:"rgba(224,107,168,.35)" },
  oros:    { bg:"#2a1e00", border:"#f0b429", num:"#ffd166", sym:"#f0b429", glow:"rgba(240,180,41,.35)" },
};

function trPow(v,s) {
  if(v===1&&s==="espadas") return 14; if(v===1&&s==="bastos") return 13;
  if(v===7&&s==="espadas") return 12; if(v===7&&s==="oros")   return 11;
  if(v===3)return 10; if(v===2)return 9;  if(v===1)return 8;
  if(v===12)return 7; if(v===11)return 6; if(v===10)return 5;
  if(v===7)return 4;  if(v===6)return 3;  if(v===5)return 2;
  return 1;
}
const TCHAIN = {
  truco:      {label:"¡Truco!",       a:2,r:1,next:"retruco"},
  retruco:    {label:"¡Retruco!",     a:3,r:2,next:"valeCuatro"},
  valeCuatro: {label:"¡Vale Cuatro!", a:4,r:3,next:null},
};
const ECHN = {
  "E":         {a:2,   r:1,next:["E","RE","FE"]},
  "E,E":       {a:4,   r:2,next:["RE","FE"]},
  "RE":        {a:3,   r:1,next:["FE"]},
  "E,RE":      {a:5,   r:2,next:["FE"]},
  "E,E,RE":    {a:7,   r:4,next:["FE"]},
  "FE":        {a:null,r:1,next:[]},
  "E,FE":      {a:null,r:2,next:[]},
  "RE,FE":     {a:null,r:3,next:[]},
  "E,RE,FE":   {a:null,r:5,next:[]},
  "E,E,FE":    {a:null,r:4,next:[]},
  "E,E,RE,FE": {a:null,r:7,next:[]},
};
const eCode  = c => c==="envido"?"E":c==="realEnvido"?"RE":"FE";
const envKey = calls => calls.map(eCode).join(",");

function mkDeck() { return SUITS.flatMap(s=>VALS.map(v=>({id:`${v}${s}`,suit:s,v,pow:trPow(v,s)}))); }
function shuffle(a) { const r=[...a]; for(let i=r.length-1;i>0;i--){const j=0|Math.random()*(i+1);[r[i],r[j]]=[r[j],r[i]];} return r; }
function envVal(v) { return v>=10?0:v; }
function calcEnvido(cards) {
  const by={};
  cards.forEach(c=>{(by[c.suit]=by[c.suit]||[]).push(envVal(c.v));});
  return Object.values(by).reduce((best,vs)=>{vs.sort((a,b)=>b-a);return Math.max(best,vs.length>=2?20+vs[0]+vs[1]:vs[0]);},0);
}
function isFlor(cards) { return cards.length===3&&new Set(cards.map(c=>c.suit)).size===1; }

/* ════════════════════════════════════════════════════════
   SONIDOS (Web Audio API)
════════════════════════════════════════════════════════ */
let _ctx = null;
function getCtx() {
  if (!_ctx) _ctx = new (window.AudioContext||window.webkitAudioContext)();
  return _ctx;
}
function playTone(freq, dur, type="sine", vol=0.15) {
  try {
    const ctx=getCtx(); if(ctx.state==="suspended") ctx.resume();
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type=type; o.frequency.value=freq;
    g.gain.setValueAtTime(vol,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur);
    o.start(); o.stop(ctx.currentTime+dur);
  } catch(e){}
}
const SFX = {
  card:    () => { playTone(380,0.08,"sine",0.12); setTimeout(()=>playTone(260,0.06,"sine",0.07),60); },
  envido:  () => { [440,550,660].forEach((f,i)=>setTimeout(()=>playTone(f,0.12,"sine",0.1),i*80)); },
  truco:   () => { [300,250,350].forEach((f,i)=>setTimeout(()=>playTone(f,0.14,"square",0.08),i*90)); },
  ganamos: () => { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>playTone(f,0.25,"sine",0.13),i*120)); },
  perdimos:() => { [400,350,280].forEach((f,i)=>setTimeout(()=>playTone(f,0.3,"sine",0.1),i*150)); },
  baza:    () => { playTone(320,0.1,"triangle",0.1); },
  quiero:  () => { playTone(500,0.1,"sine",0.1); setTimeout(()=>playTone(600,0.12,"sine",0.1),80); },
  noquiero:() => { playTone(300,0.18,"sine",0.1); setTimeout(()=>playTone(200,0.18,"sine",0.08),100); },
};

/* ════════════════════════════════════════════════════════
   LÓGICA DE MANO
════════════════════════════════════════════════════════ */
function initHand(numP, florMode, scores, lastManoRef) {
  const deck=shuffle(mkDeck());
  const mano=(lastManoRef.current+1)%numP; lastManoRef.current=mano;
  const pie=(mano+1)%numP;
  const names=["Vos","CPU 1","CPU 2","CPU 3","CPU 4","CPU 5"];
  const players=Array.from({length:numP},(_,i)=>({
    id:i,name:names[i],team:i%2,isHuman:i===0,
    hand:deck.splice(0,3),played:[],flor:false,
  }));
  players.forEach(p=>{p.flor=florMode==="con"?isFlor(p.hand):false;});
  const florResult=computeFlor(players,florMode);
  const initLog=["🃏 Nueva mano · Mano: "+players[mano].name];
  if(florResult) initLog.push(florResult.msg);
  return {
    players,numP,florMode,mano,pie,scores:[...scores],
    turn:pie,respMode:null,prevTurn:pie,baza:[],bazas:[],
    env:{st:"idle",calls:[],key:"",callerTeam:null,callerPi:null,respPi:null,winner:null,winPts:0},
    tr:{st:"idle",level:null,callerTeam:null,callerPi:null,respPi:null,winner:null,winPts:0,accepted:false},
    florResult,canEnvido:true,done:false,handResult:null,log:initLog,
    lastEvent:null, // para animaciones/notificaciones
  };
}
function computeFlor(players,mode) {
  if(mode!=="con") return null;
  const fp=players.filter(p=>p.flor); if(!fp.length) return null;
  const t0=fp.filter(p=>p.team===0),t1=fp.filter(p=>p.team===1);
  if(t0.length&&!t1.length) return {winner:0,pts:3,msg:"🌸 Flor → Nosotros +3"};
  if(t1.length&&!t0.length) return {winner:1,pts:3,msg:"🌸 Flor → Ellos +3"};
  const bA=Math.max(...t0.map(p=>calcEnvido(p.hand))),bB=Math.max(...t1.map(p=>calcEnvido(p.hand)));
  const w=bA>=bB?0:1;
  return {winner:w,pts:6,msg:`🌸 Contraflor! A:${bA} B:${bB} → ${w===0?"Nosotros":"Ellos"} +6`};
}

function doPlayCard(G,pi,ci) {
  if(G.done||G.turn!==pi||G.respMode) return G;
  const card=G.players[pi].hand[ci];
  const players=G.players.map((p,i)=>{
    if(i!==pi) return p;
    const hand=[...p.hand]; hand.splice(ci,1);
    return {...p,hand,played:[...p.played,card]};
  });
  const baza=[...G.baza,{pi,card}];
  const log=[...G.log,`${G.players[pi].name} jugó ${VNAME[card.v]} de ${card.suit}`];
  if(baza.length<G.numP) return {...G,players,baza,canEnvido:false,log,turn:(pi+1)%G.numP,lastEvent:"card"};
  return resolveBaza({...G,players,baza,canEnvido:false,log});
}
function resolveBaza(G) {
  const top=Math.max(...G.baza.map(x=>x.card.pow));
  const tops=G.baza.filter(x=>x.card.pow===top);
  const teams=[...new Set(tops.map(x=>x.pi%2))];
  const w=teams.length>1?"tie":teams[0];
  const bazas=[...G.bazas,{w,plays:[...G.baza]}];
  const wlabel=w==="tie"?"🤝 Parda":w===0?"✅ Baza → Nosotros":"✅ Baza → Ellos";
  const log=[...G.log,wlabel];
  const c0=bazas.filter(b=>b.w===0).length,c1=bazas.filter(b=>b.w===1).length;
  if(c0===2||c1===2||bazas.length===3) return endHand({...G,bazas,baza:[],log,lastEvent:"baza"});
  let next;
  if(w==="tie"){ next=G.pie; }
  else { for(let i=0;i<G.numP;i++){const idx=(G.pie+i)%G.numP;if(G.players[idx].team===w){next=idx;break;}} }
  return {...G,bazas,baza:[],log,turn:next,lastEvent:"baza"};
}
function doCallEnvido(G,pi,call) {
  if(G.done||!G.canEnvido||G.tr.st==="pending") return G;
  if(G.env.st==="idle"&&G.turn!==pi) return G;
  if(G.env.st==="pending"&&G.env.respPi!==pi) return G;
  const callerTeam=G.players[pi].team;
  const calls=[...G.env.calls,call],key=envKey(calls);
  let respPi=null;
  for(let i=0;i<G.numP;i++){const idx=(G.pie+i)%G.numP;if(G.players[idx].team!==callerTeam){respPi=idx;break;}}
  const nm={envido:"Envido",realEnvido:"Real Envido",faltaEnvido:"Falta Envido"};
  const log=[...G.log,`${G.players[pi].name}: ¡${nm[call]}!`];
  const prevTurn=G.respMode?G.prevTurn:G.turn;
  return {...G,log,env:{...G.env,st:"pending",calls,key,callerTeam,callerPi:pi,respPi},respMode:"envido",prevTurn,turn:respPi,lastEvent:"envido"};
}
function doRespEnvido(G,pi,action) {
  if(G.env.respPi!==pi||G.turn!==pi) return G;
  if(action==="noQuiero") {
    const info=ECHN[G.env.key]||{r:1};
    const log=[...G.log,`${G.players[pi].name} no quiere · ${G.env.callerTeam===0?"Nosotros":"Ellos"} +${info.r}`];
    return {...G,log,env:{...G.env,st:"resolved",winner:G.env.callerTeam,winPts:info.r},respMode:null,turn:G.prevTurn,lastEvent:"noquiero"};
  }
  if(action==="quiero") {
    const info=ECHN[G.env.key]||{a:2};
    const falta=Math.max(30-G.scores[0],30-G.scores[1]);
    const pts=info.a!==null?info.a:falta;
    const t0=Math.max(...G.players.filter(p=>p.team===0).map(p=>calcEnvido([...p.hand,...p.played])));
    const t1=Math.max(...G.players.filter(p=>p.team===1).map(p=>calcEnvido([...p.hand,...p.played])));
    const winner=t0>t1?0:t1>t0?1:G.env.callerTeam;
    const log=[...G.log,`¡Envido! Nosotros:${t0} Ellos:${t1} → ${winner===0?"Nosotros":"Ellos"} +${pts}`];
    return {...G,log,env:{...G.env,st:"resolved",winner,winPts:pts},respMode:null,turn:G.prevTurn,lastEvent:"quiero"};
  }
  const nm={envido:"Envido",realEnvido:"Real Envido",faltaEnvido:"Falta Envido"};
  const log=[...G.log,`${G.players[pi].name}: ¡${nm[action]}!`];
  const calls=[...G.env.calls,action],key=envKey(calls);
  const callerTeam=G.players[pi].team;
  let respPi=null;
  for(let i=0;i<G.numP;i++){const idx=(G.pie+i)%G.numP;if(G.players[idx].team!==callerTeam){respPi=idx;break;}}
  return {...G,log,env:{...G.env,st:"pending",calls,key,callerTeam,callerPi:pi,respPi},turn:respPi,lastEvent:"envido"};
}
function doCallTruco(G,pi,level) {
  if(G.done||G.respMode==="envido") return G;
  if(G.tr.st==="idle"&&G.turn!==pi) return G;
  if(G.tr.st==="pending"&&G.tr.respPi!==pi) return G;
  const callerTeam=G.players[pi].team;
  let respPi=null;
  for(let i=0;i<G.numP;i++){const idx=(G.pie+i)%G.numP;if(G.players[idx].team!==callerTeam){respPi=idx;break;}}
  const log=[...G.log,`${G.players[pi].name}: ${TCHAIN[level].label}`];
  const prevTurn=G.respMode?G.prevTurn:G.turn;
  return {...G,log,tr:{...G.tr,st:"pending",level,callerTeam,callerPi:pi,respPi},respMode:"truco",prevTurn,turn:respPi,lastEvent:"truco"};
}
function doRespTruco(G,pi,action) {
  if(G.tr.respPi!==pi||G.turn!==pi) return G;
  if(action==="noQuiero") {
    const d=TCHAIN[G.tr.level];
    const log=[...G.log,`${G.players[pi].name} no quiere · ${G.tr.callerTeam===0?"Nosotros":"Ellos"} +${d.r}`];
    return endHand({...G,log,tr:{...G.tr,st:"resigned",winner:G.tr.callerTeam,winPts:d.r},respMode:null,lastEvent:"noquiero"});
  }
  if(action==="quiero") {
    const log=[...G.log,`${G.players[pi].name} quiere · vale ${TCHAIN[G.tr.level].a}`];
    return {...G,log,tr:{...G.tr,st:"accepted",accepted:true},respMode:null,turn:G.prevTurn,lastEvent:"quiero"};
  }
  if(action==="raise") {
    const nl=TCHAIN[G.tr.level].next; if(!nl) return G;
    return doCallTruco({...G,tr:{...G.tr,st:"idle"},respMode:null},pi,nl);
  }
  return G;
}
function doMazo(G,pi) {
  if(G.done||G.respMode||G.turn!==pi) return G;
  const log=[...G.log,`${G.players[pi].name} se fue al mazo`];
  return endHand({...G,log,tr:{...G.tr,st:"resigned",winner:1-(pi%2),winPts:1},lastEvent:"noquiero"});
}
function endHand(G) {
  const manoTeam=G.players[G.mano].team;
  const c0=G.bazas.filter(b=>b.w===0).length,c1=G.bazas.filter(b=>b.w===1).length;
  let trucoW=c0>c1?0:c1>c0?1:null;
  if(trucoW===null){for(const b of G.bazas)if(b.w!=="tie"){trucoW=b.w;break;} if(trucoW===null)trucoW=manoTeam;}
  const delta=[0,0],msgs=[];
  if(G.florResult){delta[G.florResult.winner]+=G.florResult.pts;msgs.push(`Flor: ${G.florResult.winner===0?"Nosotros":"Ellos"} +${G.florResult.pts}`);}
  if(G.env.st==="resolved"){delta[G.env.winner]+=G.env.winPts;msgs.push(`Envido: ${G.env.winner===0?"Nosotros":"Ellos"} +${G.env.winPts}`);}
  let tPts,tWin;
  if(G.tr.st==="resigned"){tPts=G.tr.winPts;tWin=G.tr.winner;}
  else if(G.tr.st==="accepted"){tPts=TCHAIN[G.tr.level].a;tWin=trucoW;}
  else{tPts=1;tWin=trucoW;}
  delta[tWin]+=tPts;
  msgs.push(`Truco: ${tWin===0?"Nosotros":"Ellos"} +${tPts}`);
  const log=[...G.log,...msgs,"── Fin de mano ──"];
  return {...G,done:true,handResult:{delta,msgs},log};
}

/* ════════════════════════════════════════════════════════
   IA
════════════════════════════════════════════════════════ */
function aiDecide(G) {
  const pi=G.turn,p=G.players[pi];
  const myEnv=calcEnvido(p.hand);
  const myPow=p.hand.length?Math.max(...p.hand.map(c=>c.pow)):0;
  if(G.respMode==="envido"&&G.env.respPi===pi){
    const info=ECHN[G.env.key]||{r:1,next:[]},next=info.next||[];
    if(myEnv>=31&&next.includes("FE")) return G=>doRespEnvido(G,pi,"faltaEnvido");
    if(myEnv>=28&&next.includes("RE")) return G=>doRespEnvido(G,pi,"realEnvido");
    if(myEnv>=27&&next.includes("E"))  return G=>doRespEnvido(G,pi,"envido");
    if(myEnv>=23) return G=>doRespEnvido(G,pi,"quiero");
    if(myEnv>=20&&Math.random()>.5) return G=>doRespEnvido(G,pi,"quiero");
    return G=>doRespEnvido(G,pi,"noQuiero");
  }
  if(G.respMode==="truco"&&G.tr.respPi===pi){
    const nl=TCHAIN[G.tr.level]?.next;
    if(myPow>=13&&nl&&Math.random()>.45) return G=>doRespTruco(G,pi,"raise");
    if(myPow>=9) return G=>doRespTruco(G,pi,"quiero");
    if(myPow>=7&&Math.random()>.45) return G=>doRespTruco(G,pi,"quiero");
    return G=>doRespTruco(G,pi,"noQuiero");
  }
  if(G.turn===pi&&!G.respMode){
    if(G.canEnvido&&G.env.st==="idle"&&G.tr.st==="idle"&&G.bazas.length===0){
      if(myEnv>=28&&Math.random()>.2) return G=>doCallEnvido(G,pi,"realEnvido");
      if(myEnv>=24&&Math.random()>.3) return G=>doCallEnvido(G,pi,"envido");
    }
    if(G.tr.st==="idle"&&!G.respMode){
      if(myPow>=12&&Math.random()>.3) return G=>doCallTruco(G,pi,"truco");
      if(myPow>=9&&Math.random()>.55) return G=>doCallTruco(G,pi,"truco");
    }
    if(p.hand.length>0){
      const idx=p.hand.reduce((bi,c,i)=>c.pow<p.hand[bi].pow?i:bi,0);
      return G=>doPlayCard(G,pi,idx);
    }
  }
  return null;
}

/* ════════════════════════════════════════════════════════
   HOOKS
════════════════════════════════════════════════════════ */
// Dispara SFX según lastEvent
function useSFX(G) {
  const prev = useRef(null);
  useEffect(() => {
    if (!G.lastEvent || G.lastEvent===prev.current) return;
    prev.current = G.lastEvent;
    switch(G.lastEvent) {
      case "card":    SFX.card();    break;
      case "baza":    SFX.baza();    break;
      case "envido":  SFX.envido();  break;
      case "truco":   SFX.truco();   break;
      case "quiero":  SFX.quiero();  break;
      case "noquiero":SFX.noquiero();break;
    }
  }, [G.lastEvent]);
}

// Notificación flotante
function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const show = useCallback((msg, type="info") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ msg, type, id:Date.now() });
    timerRef.current = setTimeout(() => setToast(null), 2800);
  }, []);
  return [toast, show];
}

/* ════════════════════════════════════════════════════════
   COMPONENTES UI
════════════════════════════════════════════════════════ */

// ── CSS global ──
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  body { background:#1a3d2b; }
  ::-webkit-scrollbar { width:3px; } ::-webkit-scrollbar-thumb { background:rgba(201,168,76,.3); border-radius:2px; }

  @keyframes pulse      { 0%,100%{opacity:.35} 50%{opacity:.9} }
  @keyframes fadeUp     { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn     { from{opacity:0} to{opacity:1} }
  @keyframes floatDown  { 0%{transform:translateY(-60px) rotate(0deg);opacity:.06} 100%{transform:translateY(110vh) rotate(360deg);opacity:.02} }
  @keyframes slideIn    { from{opacity:0;transform:translateY(-14px) scale(.95)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes slideOut   { from{opacity:1;transform:translateY(0) scale(1)} to{opacity:0;transform:translateY(-14px) scale(.95)} }
  @keyframes cardDeal   { from{opacity:0;transform:translateY(-30px) scale(.8) rotate(-6deg)} to{opacity:1;transform:none} }
  @keyframes bazaFlash  { 0%{box-shadow:0 0 0 transparent} 30%{box-shadow:0 0 24px 4px #c9a84c55} 100%{box-shadow:none} }
  @keyframes shimmer    { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
  @keyframes toastIn    { from{opacity:0;transform:translateX(60px)} to{opacity:1;transform:none} }
  @keyframes toastOut   { from{opacity:1;transform:none} to{opacity:0;transform:translateX(60px)} }
  @keyframes scaleIn    { from{opacity:0;transform:scale(.85)} to{opacity:1;transform:scale(1)} }
  @keyframes pointBump  { 0%{transform:scale(1)} 40%{transform:scale(1.35)} 100%{transform:scale(1)} }

  .card-deal { animation: cardDeal .35s ease both; }
  .slide-in  { animation: slideIn  .22s ease both; }
  .baza-flash{ animation: bazaFlash .6s ease; }
`;

// ── Toast ──
function Toast({ toast }) {
  if (!toast) return null;
  const colors = {
    info:    { bg:"rgba(78,140,255,.18)",  border:"#4e8cff55",  c:"#8abcf5"  },
    success: { bg:"rgba(78,203,113,.18)",  border:"#4ecb7155",  c:"#8ae8b0"  },
    warning: { bg:"rgba(240,180,41,.18)",  border:"#f0b42955",  c:"#ffd166"  },
    danger:  { bg:"rgba(224,96,96,.18)",   border:"#e0606055",  c:"#f59090"  },
  };
  const s = colors[toast.type]||colors.info;
  return (
    <div key={toast.id} style={{
      position:"fixed",top:"4.5rem",right:"1rem",zIndex:200,
      background:s.bg,border:`1px solid ${s.border}`,
      borderRadius:12,padding:".7rem 1.2rem",
      color:s.c,fontFamily:"'Crimson Text',serif",fontSize:".95rem",
      boxShadow:"0 8px 24px rgba(0,0,0,.5)",
      animation:"toastIn .3s ease both",maxWidth:260,
      backdropFilter:"blur(8px)",
    }}>
      {toast.msg}
    </div>
  );
}

// ── Progress bar de puntaje ──
function ScoreBar({ nosotros, ellos }) {
  const total = 30;
  const pA = Math.min((nosotros/total)*100,100);
  const pB = Math.min((ellos/total)*100,100);
  return (
    <div style={{ display:"flex",alignItems:"center",gap:".5rem",flex:1,maxWidth:300 }}>
      <span style={{ fontFamily:"'Cinzel',serif",fontSize:"1rem",fontWeight:700,color:"#4e8cff",minWidth:24,textAlign:"right",transition:"all .4s" }}
        className={nosotros>0?"point-bump":""}>{nosotros}</span>
      <div style={{ flex:1,height:6,background:"rgba(255,255,255,.08)",borderRadius:3,overflow:"hidden",position:"relative" }}>
        {/* Equipo A (izq) */}
        <div style={{ position:"absolute",left:0,top:0,height:"100%",width:`${pA/2}%`,background:"linear-gradient(90deg,#4e8cff,#7ab4ff)",borderRadius:3,transition:"width .5s ease" }}/>
        {/* Equipo B (der) */}
        <div style={{ position:"absolute",right:0,top:0,height:"100%",width:`${pB/2}%`,background:"linear-gradient(90deg,#f07070,#e06060)",borderRadius:3,transition:"width .5s ease" }}/>
      </div>
      <span style={{ fontFamily:"'Cinzel',serif",fontSize:"1rem",fontWeight:700,color:"#e06060",minWidth:24,transition:"all .4s" }}>{ellos}</span>
    </div>
  );
}

// ── Carta visible ──
function Card({ card, onClick, disabled, small, dealDelay=0 }) {
  const [hov, setHov] = useState(false);
  const ac = SUIT_ACCENT[card.suit];
  const w=small?50:80, h=small?76:120;
  return (
    <div
      onClick={!disabled?onClick:undefined}
      onMouseEnter={()=>!disabled&&setHov(true)}
      onMouseLeave={()=>setHov(false)}
      title={`${VNAME[card.v]} de ${card.suit} · fuerza ${card.pow}`}
      className="card-deal"
      style={{
        width:w,height:h,position:"relative",flexShrink:0,
        background:`linear-gradient(160deg,${ac.bg} 0%,#090f0a 100%)`,
        border:`2px solid ${hov&&!disabled?ac.border:"rgba(255,255,255,.12)"}`,
        borderRadius:small?7:11,cursor:disabled?"default":"pointer",
        display:"flex",flexDirection:"column",justifyContent:"space-between",
        padding:small?"4px 5px":"6px 7px",
        boxShadow:hov&&!disabled?`0 18px 36px rgba(0,0,0,.75),0 0 20px ${ac.glow}`:"0 4px 14px rgba(0,0,0,.5)",
        transform:hov&&!disabled?"translateY(-16px)":"none",
        transition:"transform .18s,box-shadow .18s,border-color .18s",
        userSelect:"none",
        animationDelay:`${dealDelay}ms`,
      }}
    >
      {/* Fuerza badge */}
      {!small && (
        <div style={{ position:"absolute",top:-9,right:-9,background:"linear-gradient(135deg,#c9a84c,#8b6914)",color:"#1a0e00",fontFamily:"'Cinzel',serif",fontSize:".5rem",fontWeight:700,borderRadius:"50%",width:19,height:19,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(0,0,0,.5)",zIndex:1 }}>
          {card.pow}
        </div>
      )}
      <div style={{ lineHeight:1 }}>
        <div style={{ fontFamily:"'Cinzel',serif",fontSize:small?".75rem":"1rem",fontWeight:700,color:ac.num }}>{card.v}</div>
        <div style={{ fontSize:small?".6rem":".78rem",color:ac.sym }}>{SUIT_SYM[card.suit]}</div>
      </div>
      <div style={{ textAlign:"center",fontSize:small?"1rem":"1.5rem",color:ac.sym,margin:"auto 0" }}>
        {SUIT_SYM[card.suit]}
        {!small&&<div style={{ fontSize:".43rem",color:ac.num,opacity:.65,marginTop:2,fontStyle:"italic",letterSpacing:".03em" }}>{VNAME[card.v]}</div>}
      </div>
      <div style={{ lineHeight:1,transform:"rotate(180deg)",display:"flex",flexDirection:"column",alignItems:"flex-start" }}>
        <div style={{ fontFamily:"'Cinzel',serif",fontSize:small?".75rem":"1rem",fontWeight:700,color:ac.num }}>{card.v}</div>
        <div style={{ fontSize:small?".6rem":".78rem",color:ac.sym }}>{SUIT_SYM[card.suit]}</div>
      </div>
    </div>
  );
}

// ── Dorso ──
function CardBack({ small }) {
  const w=small?38:54,h=small?57:81;
  return (
    <div style={{ width:w,height:h,flexShrink:0,borderRadius:small?6:9,border:"2px solid rgba(78,140,255,.18)",boxShadow:"0 3px 10px rgba(0,0,0,.5)",
      background:`repeating-linear-gradient(45deg,rgba(78,140,255,.04) 0,rgba(78,140,255,.04) 2px,transparent 2px,transparent 8px),linear-gradient(160deg,#1a3560 0%,#0b1628 100%)` }}/>
  );
}

// ── Badge equipo ──
function TeamBadge({ team }) {
  return (
    <span style={{ fontSize:".52rem",padding:".1rem .4rem",borderRadius:10,
      background:team===0?"rgba(78,140,255,.18)":"rgba(224,96,96,.18)",
      border:team===0?"1px solid #4e8cff44":"1px solid #e0606044",
      color:team===0?"#8abcf5":"#f59090",letterSpacing:".05em" }}>
      {team===0?"Nosotros":"Ellos"}
    </span>
  );
}

// ── Slot rival ──
function PlayerSlot({ player, isTurn }) {
  return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:".3rem",
      padding:".45rem .6rem",
      background:isTurn?"rgba(201,168,76,.08)":"rgba(0,0,0,.2)",
      border:`1px solid ${isTurn?"rgba(201,168,76,.4)":"rgba(255,255,255,.06)"}`,
      borderRadius:14,transition:"all .3s",minWidth:80 }}>
      {/* Avatar */}
      <div style={{ width:32,height:32,borderRadius:"50%",
        background:player.team===0?"linear-gradient(135deg,#1a3d7a,#0d2050)":"linear-gradient(135deg,#7a1a1a,#500d0d)",
        border:`2px solid ${isTurn?"#c9a84c":player.team===0?"#4e8cff44":"#e0606044"}`,
        display:"flex",alignItems:"center",justifyContent:"center",fontSize:".85rem",
        boxShadow:isTurn?"0 0 12px rgba(201,168,76,.6)":"none",transition:"all .3s" }}>
        🤖
      </div>
      <span style={{ fontFamily:"'Cinzel',serif",fontSize:".58rem",letterSpacing:".04em",color:isTurn?"#c9a84c":"#a09070",whiteSpace:"nowrap" }}>
        {player.name}
      </span>
      <TeamBadge team={player.team}/>
      {/* Cartas */}
      <div style={{ display:"flex",gap:3,alignItems:"center" }}>
        {player.hand.map((_,i) => <CardBack key={i} small/>)}
        {player.played.map((c,i) => <div key={`p${i}`} style={{opacity:.3}}><Card card={c} disabled small/></div>)}
      </div>
      {isTurn && <div style={{ fontSize:".6rem",color:"#c9a84c",animation:"pulse 1s ease-in-out infinite" }}>● pensando...</div>}
    </div>
  );
}

// ── Baza zone ──
function BazaZone({ G }) {
  const { baza, bazas, players } = G;
  const freshBaza = bazas.length > 0 && baza.length === 0;
  return (
    <div style={{ flex:1,background:"rgba(0,0,0,.18)",border:"1px solid rgba(255,255,255,.05)",
      borderRadius:18,padding:".8rem",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:".7rem",
      minHeight:130 }} className={freshBaza?"baza-flash":""}>
      {/* Historial bazas */}
      {bazas.length>0 && (
        <div style={{ display:"flex",gap:".45rem",flexWrap:"wrap",justifyContent:"center" }}>
          {bazas.map((b,i) => {
            const color=b.w==="tie"?"#888":b.w===0?"#4e8cff":"#e06060";
            const label=b.w==="tie"?"Parda":b.w===0?"Nos.":"Ellos";
            return (
              <div key={i} style={{ fontFamily:"'Cinzel',serif",fontSize:".62rem",fontWeight:600,
                padding:".2rem .65rem",borderRadius:20,
                background:b.w==="tie"?"rgba(255,255,255,.07)":b.w===0?"rgba(78,140,255,.2)":"rgba(224,96,96,.2)",
                border:`1px solid ${color}55`,color }}>
                B{i+1}: {label}
              </div>
            );
          })}
        </div>
      )}
      {baza.length>0 ? (
        <div style={{ display:"flex",gap:".8rem",alignItems:"flex-end",flexWrap:"wrap",justifyContent:"center" }}>
          {baza.map(({pi,card}) => (
            <div key={pi} style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:".3rem" }}>
              <span style={{ fontSize:".62rem",color:"#a09070" }}>{players[pi].name}</span>
              <Card card={card} disabled small/>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ opacity:.18,fontSize:".72rem",letterSpacing:".15em",textTransform:"uppercase" }}>Mesa vacía</div>
      )}
    </div>
  );
}

// ── Panel estado ──
function StatePanel({ G }) {
  const {env,tr,scores}=G;
  const falta=Math.max(30-scores[0],30-scores[1]);
  const envLine=()=>{
    if(env.st==="idle") return {text:"—",active:false};
    if(env.st==="pending"){const info=ECHN[env.key]||{a:2,r:1};const pa=info.a!==null?info.a:falta;return{text:`${env.key.replace(/,/g," + ")}  ·  Sí:${pa}  No:${info.r}`,active:true};}
    return{text:`${env.winner===0?"✅ Nosotros":"✅ Ellos"} +${env.winPts}`,active:false};
  };
  const trLine=()=>{
    if(tr.st==="idle") return{text:"—",active:false};
    if(tr.st==="pending"){const d=TCHAIN[tr.level];return{text:`${tr.level}  ·  Sí:${d.a}  No:${d.r}`,active:true};}
    if(tr.st==="accepted") return{text:`${tr.level} ✔ (${TCHAIN[tr.level].a} pts)`,active:false};
    return{text:`${tr.winner===0?"✅ Nosotros":"✅ Ellos"} +${tr.winPts}`,active:false};
  };
  const el=envLine(),tl=trLine();
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:".45rem",width:188,flexShrink:0 }}>
      {[{title:"Envido",l:el,icon:"🎯"},{title:"Truco",l:tl,icon:"⚡"}].map(({title,l,icon})=>(
        <div key={title} style={{ background:"rgba(0,0,0,.28)",border:`1px solid ${l.active?"rgba(201,168,76,.3)":"rgba(255,255,255,.06)"}`,borderRadius:12,padding:".55rem .75rem",transition:"border-color .3s" }}>
          <div style={{ display:"flex",alignItems:"center",gap:".35rem",marginBottom:".3rem" }}>
            <span style={{ fontSize:".7rem" }}>{icon}</span>
            <span style={{ fontFamily:"'Cinzel',serif",fontSize:".6rem",letterSpacing:".13em",color:"#c9a84c",textTransform:"uppercase" }}>{title}</span>
            {l.active&&<span style={{ fontSize:".55rem",background:"rgba(201,168,76,.2)",color:"#c9a84c",padding:".05rem .35rem",borderRadius:8,animation:"pulse 1.5s ease-in-out infinite" }}>●</span>}
          </div>
          <div style={{ fontSize:".76rem",color:l.active?"#e8c86a":"#a09070",lineHeight:1.45 }}>{l.text}</div>
        </div>
      ))}
      <LogBox log={G.log}/>
    </div>
  );
}

// ── Log ──
function LogBox({ log }) {
  const ref=useRef();
  useEffect(()=>{if(ref.current)ref.current.scrollTop=ref.current.scrollHeight;},[log]);
  return (
    <div ref={ref} style={{ background:"rgba(0,0,0,.28)",border:"1px solid rgba(255,255,255,.06)",borderRadius:10,padding:".5rem .65rem",maxHeight:96,overflowY:"auto",flex:1 }}>
      {log.slice(-12).map((l,i,a)=>(
        <div key={i} style={{ fontSize:".7rem",lineHeight:1.7,color:i===a.length-1?"#e8c86a":"#806a50",opacity:i===a.length-1?1:.7+(i/a.length)*.3 }}>{l}</div>
      ))}
    </div>
  );
}

// ── Botón de acción ──
function Btn({ label, cls, onClick, pulse }) {
  const [hov,setHov]=useState(false);
  const theme={
    env:   {bg:"rgba(78,140,255,.14)",  bdr:"rgba(78,140,255,.45)",  c:"#8abcf5"},
    truco: {bg:"rgba(224,96,96,.14)",   bdr:"rgba(224,96,96,.45)",   c:"#f59090"},
    ok:    {bg:"rgba(78,200,130,.14)",  bdr:"rgba(78,200,130,.45)",  c:"#8ae8b0"},
    no:    {bg:"rgba(255,255,255,.05)", bdr:"rgba(255,255,255,.18)", c:"#b0a080"},
    raise: {bg:"rgba(255,180,50,.13)",  bdr:"rgba(255,180,50,.45)",  c:"#ffc870"},
    mazo:  {bg:"transparent",          bdr:"rgba(255,255,255,.1)",  c:"#806a50"},
  }[cls]||{bg:"rgba(255,255,255,.06)",bdr:"rgba(255,255,255,.15)",c:"#b0a080"};
  return (
    <button
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      onClick={onClick}
      style={{ padding:".46rem .95rem",borderRadius:8,fontFamily:"'Crimson Text',serif",
        fontSize:".9rem",fontWeight:600,cursor:"pointer",
        background:hov?theme.bdr.replace(",.45",",.22"):theme.bg,
        border:`1px solid ${hov?theme.bdr:theme.bdr.replace(",.45",",.3")}`,
        color:theme.c,transition:"all .15s",
        animation:pulse?"pulse 1.5s ease-in-out infinite":"none" }}>
      {label}
    </button>
  );
}

// ── Botones de acción del humano ──
function ActionButtons({ G, onCallEnvido, onRespEnvido, onCallTruco, onRespTruco, onMazo }) {
  if(G.done||G.turn!==0) return null;
  const myEnv=calcEnvido(G.players[0].hand);

  if(G.respMode==="envido"&&G.env.respPi===0) {
    const info=ECHN[G.env.key]||{r:1,next:[]};
    const falta=Math.max(30-G.scores[0],30-G.scores[1]);
    const pa=info.a!==null?info.a:falta,next=info.next||[];
    return (
      <div className="slide-in" style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:".5rem",width:"100%" }}>
        <div style={{ fontSize:".78rem",color:"#c9a84c",fontStyle:"italic",background:"rgba(201,168,76,.09)",padding:".4rem 1.1rem",borderRadius:20,border:"1px solid rgba(201,168,76,.2)" }}>
          Tu envido: <strong>{myEnv}</strong> puntos
        </div>
        <div style={{ display:"flex",flexWrap:"wrap",gap:".5rem",justifyContent:"center" }}>
          {next.includes("E")  && <Btn label="+ Envido"     cls="env"   onClick={()=>onRespEnvido("envido")}/>}
          {next.includes("RE") && <Btn label="Real Envido"  cls="env"   onClick={()=>onRespEnvido("realEnvido")}/>}
          {next.includes("FE") && <Btn label="Falta Envido" cls="env"   onClick={()=>onRespEnvido("faltaEnvido")}/>}
          <Btn label={`Quiero (${pa} pt${pa!==1?"s":""})`}  cls="ok"   onClick={()=>onRespEnvido("quiero")} pulse/>
          <Btn label={`No quiero (${info.r} pt)`}           cls="no"   onClick={()=>onRespEnvido("noQuiero")}/>
        </div>
      </div>
    );
  }
  if(G.respMode==="truco"&&G.tr.respPi===0) {
    const d=TCHAIN[G.tr.level];
    return (
      <div className="slide-in" style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:".5rem",width:"100%" }}>
        <div style={{ fontSize:".78rem",color:"#f0c0a0",fontStyle:"italic",background:"rgba(224,96,96,.1)",padding:".4rem 1.1rem",borderRadius:20,border:"1px solid rgba(224,96,96,.28)" }}>
          {G.players[G.tr.callerPi].name} cantó <strong>{G.tr.level}</strong>
        </div>
        <div style={{ display:"flex",flexWrap:"wrap",gap:".5rem",justifyContent:"center" }}>
          {d.next&&<Btn label={TCHAIN[d.next].label}        cls="raise" onClick={()=>onRespTruco("raise")}/>}
          <Btn label={`Quiero (${d.a} pts)`}                cls="ok"    onClick={()=>onRespTruco("quiero")} pulse/>
          <Btn label={`No quiero (${d.r} pt)`}              cls="no"    onClick={()=>onRespTruco("noQuiero")}/>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display:"flex",flexWrap:"wrap",gap:".45rem",justifyContent:"center",maxWidth:520 }}>
      {G.canEnvido&&G.env.st==="idle"&&G.tr.st==="idle"&&<>
        <Btn label={`Envido (${myEnv})`}  cls="env"   onClick={()=>onCallEnvido("envido")}/>
        <Btn label="Real Envido"          cls="env"   onClick={()=>onCallEnvido("realEnvido")}/>
        <Btn label="Falta Envido"         cls="env"   onClick={()=>onCallEnvido("faltaEnvido")}/>
      </>}
      {G.tr.st==="idle"&&<Btn label="¡Truco!" cls="truco" onClick={()=>onCallTruco("truco")}/>}
      {G.tr.st==="accepted"&&G.tr.callerTeam!==0&&TCHAIN[G.tr.level]?.next&&
        <Btn label={TCHAIN[TCHAIN[G.tr.level].next].label} cls="raise" onClick={()=>onCallTruco(TCHAIN[G.tr.level].next)}/>}
      <Btn label="Al Mazo" cls="mazo" onClick={onMazo}/>
    </div>
  );
}

// ── Mano humano ──
function HumanHand({ player, canPlay, onPlay }) {
  return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:".65rem" }}>
      <div style={{ display:"flex",alignItems:"center",gap:".5rem" }}>
        <div style={{ width:34,height:34,borderRadius:"50%",background:"linear-gradient(135deg,#1a3d7a,#0d2050)",border:"2px solid #4e8cff88",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem" }}>🧑</div>
        <div>
          <div style={{ fontFamily:"'Cinzel',serif",fontSize:".7rem",color:"#c9a84c" }}>{player.name}</div>
          <TeamBadge team={0}/>
        </div>
      </div>
      <div style={{ display:"flex",gap:".85rem",alignItems:"flex-end",flexWrap:"wrap",justifyContent:"center" }}>
        {player.hand.map((card,i) => (
          <Card key={card.id} card={card} onClick={()=>onPlay(i)} disabled={!canPlay} dealDelay={i*80}/>
        ))}
        {player.played.map((c,i) => (
          <div key={`p${i}`} style={{opacity:.28}}><Card card={c} disabled/></div>
        ))}
      </div>
    </div>
  );
}

// ── Modal fin de mano / partida ──
function HandModal({ G, newScores, onNext, onNewGame }) {
  const { handResult } = G;
  if (!handResult) return null;
  const gameOver = newScores[0]>=30||newScores[1]>=30;
  const winner   = newScores[0]>=30?0:1;

  useEffect(()=>{
    if(gameOver) winner===0?SFX.ganamos():SFX.perdimos();
  },[]);

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,backdropFilter:"blur(7px)",animation:"fadeIn .25s ease" }}>
      <div style={{ background:"linear-gradient(160deg,#1e3d28,#0d1f16)",border:"2px solid #c9a84c",borderRadius:22,padding:"2rem",width:"min(400px,93vw)",textAlign:"center",boxShadow:"0 24px 70px rgba(0,0,0,.85)",animation:"scaleIn .3s ease" }}>
        <div style={{ fontSize:"2.2rem",marginBottom:".3rem" }}>
          {gameOver?(winner===0?"🏆":"💀"):"🂠"}
        </div>
        <div style={{ fontFamily:"'Cinzel',serif",color:"#c9a84c",fontSize:"1.5rem",marginBottom:".4rem" }}>
          {gameOver?(winner===0?"¡Ganamos!":"Perdimos"):"Fin de Mano"}
        </div>
        <div style={{ color:"#a09070",fontStyle:"italic",fontSize:".9rem",marginBottom:"1.4rem" }}>
          {gameOver?`El equipo ${winner===0?"A":"B"} llegó a 30 puntos`:`+${handResult.delta[0]} Nosotros  ·  +${handResult.delta[1]} Ellos`}
        </div>
        {/* Marcador */}
        <div style={{ display:"flex",gap:"1.5rem",justifyContent:"center",marginBottom:"1.3rem" }}>
          {[{l:"Nosotros",p:newScores[0],c:"#4e8cff"},{l:"Ellos",p:newScores[1],c:"#e06060"}].map(({l,p,c})=>(
            <div key={l} style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:".2rem" }}>
              <div style={{ fontSize:".68rem",opacity:.65,letterSpacing:".08em",textTransform:"uppercase" }}>{l}</div>
              <div style={{ fontFamily:"'Cinzel',serif",fontSize:"2rem",fontWeight:700,color:c,animation:"pointBump .4s ease" }}>{p}</div>
              <div style={{ fontSize:".65rem",opacity:.5 }}>/30</div>
            </div>
          ))}
        </div>
        {/* Detalle */}
        <div style={{ textAlign:"left",background:"rgba(0,0,0,.3)",borderRadius:10,padding:".65rem 1rem",maxHeight:120,overflowY:"auto",marginBottom:"1.2rem" }}>
          {handResult.msgs.map((m,i)=>(
            <div key={i} style={{ fontSize:".8rem",lineHeight:1.75,color:"#e8c86a" }}>{m}</div>
          ))}
        </div>
        <button
          onClick={gameOver?onNewGame:onNext}
          style={{ width:"100%",padding:".9rem",background:"linear-gradient(135deg,#c9a84c,#8b6914)",border:"none",borderRadius:12,color:"#1a0e00",fontFamily:"'Cinzel',serif",fontSize:"1rem",fontWeight:700,letterSpacing:".1em",cursor:"pointer",boxShadow:"0 4px 20px rgba(201,168,76,.35)",transition:"all .2s" }}>
          {gameOver?"Nueva Partida":"Siguiente Mano ▶"}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   GAME SCREEN
════════════════════════════════════════════════════════ */
function GameScreen({ config, onMenu }) {
  const { numP, mode } = config;
  const lastManoRef = useRef(-1);
  const [scores, setScores]   = useState([0,0]);
  const [G, setG]             = useState(()=>initHand(numP,mode,[0,0],{current:-1}));
  const [toast, showToast]    = useToast();
  const aiTimerRef            = useRef(null);

  useSFX(G);

  // Watcher: mostrar toast cuando la IA canta algo
  const prevLog = useRef(G.log.length);
  useEffect(()=>{
    if(G.log.length>prevLog.current){
      const last=G.log[G.log.length-1];
      if(last.includes("CPU")&&(last.includes("Truco")||last.includes("Envido")||last.includes("quiere")||last.includes("quiero")))
        showToast(last,"warning");
      prevLog.current=G.log.length;
    }
  },[G.log]);

  // IA
  useEffect(()=>{
    if(aiTimerRef.current) clearTimeout(aiTimerRef.current);
    if(G.done||G.turn===0) return;
    aiTimerRef.current=setTimeout(()=>{
      setG(prev=>{
        if(prev.done||prev.turn===0) return prev;
        const action=aiDecide(prev);
        return action?action(prev):prev;
      });
    },750);
  },[G.turn,G.respMode,G.done]);

  const dispatch = useCallback(fn=>setG(prev=>fn(prev)),[]);
  const handlePlay      = i => { SFX.card(); dispatch(G=>doPlayCard(G,0,i)); };
  const handleCallEnv   = c => dispatch(G=>doCallEnvido(G,0,c));
  const handleRespEnv   = a => dispatch(G=>doRespEnvido(G,0,a));
  const handleCallTruco = l => dispatch(G=>doCallTruco(G,0,l));
  const handleRespTruco = a => dispatch(G=>doRespTruco(G,0,a));
  const handleMazo      = () => dispatch(G=>doMazo(G,0));

  const newScores = G.handResult
    ? [scores[0]+G.handResult.delta[0], scores[1]+G.handResult.delta[1]]
    : scores;

  const handleNext = () => {
    setScores(newScores);
    setG(initHand(numP,mode,newScores,lastManoRef));
    prevLog.current=0;
  };
  const handleNewGame = () => {
    lastManoRef.current=-1; setScores([0,0]);
    setG(initHand(numP,mode,[0,0],lastManoRef)); prevLog.current=0;
  };

  const canPlay = !G.done&&G.turn===0&&!G.respMode;

  // Layout rivales
  const r4=[{p:G.players[2],a:"tl"},{p:G.players[1],a:"r"},{p:G.players[3],a:"l"}];
  const r6=[{p:G.players[2],a:"tl"},{p:G.players[4],a:"tm"},{p:G.players[5],a:"tr"},{p:G.players[1],a:"r"},{p:G.players[3],a:"l"}];
  const rivals=numP===4?r4:r6;
  const tpl=numP===4
    ? `"l tl r" auto "l baza r" 1fr "l human r" auto / auto 1fr auto`
    : `"tl tm tr" auto ". baza ." 1fr "l human r" auto / auto 1fr auto`;

  return (
    <div style={{ minHeight:"100vh",display:"flex",flexDirection:"column",
      background:`radial-gradient(ellipse at 25% 20%,rgba(255,255,255,.015) 0%,transparent 50%),repeating-linear-gradient(45deg,transparent,transparent 48px,rgba(0,0,0,.022) 48px,rgba(0,0,0,.022) 49px),#1a3d2b` }}>
      <style>{GLOBAL_CSS}</style>

      {/* Top bar */}
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:".6rem 1.3rem",background:"#3d2010",borderBottom:"3px solid #c9a84c",boxShadow:"0 3px 14px rgba(0,0,0,.5)",gap:"1rem",flexWrap:"wrap" }}>
        <span style={{ fontFamily:"'Cinzel',serif",color:"#c9a84c",fontSize:".9rem",letterSpacing:".2em",whiteSpace:"nowrap" }}>♠ TRUCO</span>
        <ScoreBar nosotros={scores[0]} ellos={scores[1]}/>
        <button onClick={onMenu} style={{ fontFamily:"'Cinzel',serif",fontSize:".68rem",letterSpacing:".1em",padding:".32rem .85rem",background:"transparent",border:"1px solid rgba(201,168,76,.35)",borderRadius:6,color:"#c9a84c",cursor:"pointer",whiteSpace:"nowrap" }}>← Menú</button>
      </div>

      {/* Turn banner */}
      <div style={{ textAlign:"center",padding:".3rem",background:canPlay?"rgba(201,168,76,.09)":"rgba(0,0,0,.2)",borderBottom:"1px solid rgba(255,255,255,.04)",fontFamily:"'Cinzel',serif",fontSize:".66rem",letterSpacing:".14em",color:canPlay?"#c9a84c":"#605040",transition:"all .3s" }}>
        {G.done?"🏁  MANO TERMINADA":canPlay?"🟢  TU TURNO — Jugá una carta o cantá":`⏳  ${G.players[G.turn]?.name||"..."}`}
      </div>

      {/* Mesa */}
      <div style={{ flex:1,display:"grid",gridTemplate:tpl,gap:".55rem",padding:".7rem .9rem",alignItems:"center" }}>
        {rivals.map(({p,a})=>(
          <div key={p.id} style={{ gridArea:a,display:"flex",justifyContent:"center" }}>
            <PlayerSlot player={p} isTurn={G.turn===p.id}/>
          </div>
        ))}
        <div style={{ gridArea:"baza",display:"flex",gap:".65rem",alignItems:"stretch" }}>
          <BazaZone G={G}/>
          <StatePanel G={G}/>
        </div>
        <div style={{ gridArea:"human",display:"flex",flexDirection:"column",alignItems:"center",gap:".65rem",paddingTop:".2rem" }}>
          <ActionButtons G={G} onCallEnvido={handleCallEnv} onRespEnvido={handleRespEnv} onCallTruco={handleCallTruco} onRespTruco={handleRespTruco} onMazo={handleMazo}/>
          <HumanHand player={G.players[0]} canPlay={canPlay} onPlay={handlePlay}/>
        </div>
      </div>

      {/* Toast */}
      <Toast toast={toast}/>

      {/* Modal */}
      {G.done&&<HandModal G={G} newScores={newScores} onNext={handleNext} onNewGame={handleNewGame}/>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   START SCREEN
════════════════════════════════════════════════════════ */
function StartScreen({ onStart }) {
  const [mode,setMode]=useState("sin");
  const [numP,setNumP]=useState(4);
  const [hov,setHov]=useState(false);
  return (
    <div style={{ minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"radial-gradient(ellipse at 40% 40%,#1e4d34 0%,#0a1a10 70%)",padding:"2rem",position:"relative",overflow:"hidden" }}>
      <style>{GLOBAL_CSS}</style>
      {/* Símbolos flotantes */}
      <div style={{ position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none" }}>
        {["♠","♥","♦","♣","⚔","🌿","🏆","●"].flatMap((s,i)=>
          [0,1,2].map(j=>(
            <div key={`${i}${j}`} style={{ position:"absolute",left:`${(i*27+j*13+5)%93}%`,top:"-60px",fontSize:13+(i%4)*7,opacity:.05,color:"#c9a84c",animation:`floatDown ${14+(i%4)*3+j*2}s linear ${(i*1.8+j*2.5)%9}s infinite` }}>{s}</div>
          ))
        )}
      </div>
      {/* Logo */}
      <div style={{ display:"flex",flexDirection:"column",alignItems:"center",marginBottom:"2.5rem",animation:"fadeUp .8s ease both",zIndex:1 }}>
        <div style={{ fontSize:"1.5rem",color:"#c9a84c",opacity:.5,animation:"pulse 3s ease-in-out infinite" }}>♠</div>
        <h1 style={{ fontFamily:"'Cinzel',serif",fontSize:"clamp(2.8rem,9vw,5rem)",fontWeight:700,color:"#c9a84c",letterSpacing:".15em",margin:"-.2rem 0",textShadow:"0 0 40px rgba(201,168,76,.35),0 4px 12px rgba(0,0,0,.8)",lineHeight:1 }}>TRUCO</h1>
        <div style={{ fontSize:"1.5rem",color:"#c9a84c",opacity:.5,animation:"pulse 3s ease-in-out .5s infinite" }}>♥</div>
        <p style={{ fontFamily:"'Cinzel',serif",fontSize:"clamp(.6rem,1.8vw,.85rem)",letterSpacing:".55em",color:"#e8c86a",opacity:.7,marginTop:".35rem" }}>ARGENTINO</p>
      </div>
      {/* Config */}
      <div style={{ background:"rgba(10,26,16,.9)",backdropFilter:"blur(16px)",border:"1px solid rgba(201,168,76,.25)",borderRadius:20,padding:"1.8rem",width:"min(430px,92vw)",boxShadow:"0 24px 60px rgba(0,0,0,.65)",animation:"fadeUp .8s ease .18s both",zIndex:1 }}>
        {[
          {label:"Modalidad",opts:[{v:"sin",l:"Sin Flor"},{v:"con",l:"Con Flor"}],val:mode,set:setMode},
          {label:"Jugadores",opts:[{v:4,l:"4 Jugadores",sub:"2 vs 2"},{v:6,l:"6 Jugadores",sub:"3 vs 3"}],val:numP,set:setNumP},
        ].map(({label,opts,val,set})=>(
          <div key={label} style={{ marginBottom:"1.4rem" }}>
            <div style={{ fontFamily:"'Cinzel',serif",fontSize:".67rem",letterSpacing:".2em",textTransform:"uppercase",color:"#c9a84c",marginBottom:".6rem",opacity:.85 }}>{label}</div>
            <div style={{ display:"flex",gap:".55rem" }}>
              {opts.map(o=>(
                <button key={o.v} onClick={()=>set(o.v)} style={{ flex:1,padding:".68rem .5rem",background:val===o.v?"rgba(201,168,76,.18)":"rgba(255,255,255,.04)",border:`1px solid ${val===o.v?"rgba(201,168,76,.6)":"rgba(255,255,255,.09)"}`,borderRadius:10,color:val===o.v?"#e8c86a":"#c8b898",fontFamily:"'Crimson Text',serif",fontSize:".9rem",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:".1rem",lineHeight:1.3,transition:"all .18s" }}>
                  {o.l}{o.sub&&<span style={{ fontSize:".68rem",opacity:.55 }}>{o.sub}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div style={{ fontSize:".76rem",color:"#a09070",fontStyle:"italic",marginBottom:"1.3rem",display:"flex",alignItems:"center",gap:".5rem" }}>
          <span style={{ width:5,height:5,borderRadius:"50%",background:"#c9a84c",opacity:.65,display:"inline-block",flexShrink:0 }}/>
          {numP} jugadores · {mode==="con"?"Con Flor":"Sin Flor"} · 30 puntos
        </div>
        <button onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} onClick={()=>onStart({mode,numP})}
          style={{ width:"100%",padding:".95rem",background:"linear-gradient(135deg,#c9a84c,#a07828)",border:"none",borderRadius:12,color:"#1a0e00",fontFamily:"'Cinzel',serif",fontSize:"1rem",fontWeight:700,letterSpacing:".18em",cursor:"pointer",boxShadow:hov?"0 10px 32px rgba(201,168,76,.5)":"0 6px 24px rgba(201,168,76,.3)",transform:hov?"translateY(-2px)":"none",transition:"all .22s" }}>
          ¡A Jugar!
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   ROOT
════════════════════════════════════════════════════════ */
export default function TrucoApp() {
  const [screen,setScreen]=useState("start");
  const [config,setConfig]=useState(null);
  return (
    <div style={{ minHeight:"100vh",fontFamily:"'Crimson Text',serif" }}>
      {screen==="start"&&<StartScreen onStart={cfg=>{setConfig(cfg);setScreen("game");}}/>}
      {screen==="game" &&<GameScreen config={config} onMenu={()=>setScreen("start")}/>}
    </div>
  );
}
