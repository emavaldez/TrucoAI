// scripts/repro-freeze.ts — reproduce el escenario del freeze del AI
// 2 jugadores, humano juega carta en trick 2 (después de trick resuelto),
// verificamos si el engine emite 'ai-turn' para el AI.
import { GameEngine } from '../src/core/GameEngine.js';

const engine = new GameEngine();
const events: string[] = [];
const aiTurns: any[] = [];

for (const ev of ['ai-turn', 'round-start', 'card-played', 'trick-resolved', 'hand-resolved', 'round-over', 'truco-challenged', 'truco-accepted', 'truco-raised', 'envido-opened', 'envido-resolved', 'game-over']) {
  engine.on(ev, (d: any) => {
    events.push(`${ev}:${JSON.stringify(d)?.slice(0, 80)}`);
    if (ev === 'ai-turn') aiTurns.push(d);
  });
}

const players = [
  { id: 'player-0', name: 'VOS', isAI: false, isHuman: true, team: 0, position: 0 },
  { id: 'player-1', name: 'IA', isAI: true, isHuman: false, team: 1, position: 1 },
];
engine.startGame(players, { playerCount: 2, difficulty: 'normal' } as any);

// Estado inicial
const s0: any = engine.getState();
console.log('=== FASE INICIAL ===');
console.log('phase:', s0.phase, '| turno:', s0.currentTurnPlayerId, '| starter:', s0.starterId, '| dealer:', s0.dealerId);

// Si el humano es starter, juega su carta; si no, el AI juega primero
function playForHuman(): void {
  const s: any = engine.getState();
  const hand = s.hands['player-0'] || [];
  if (hand.length === 0) return;
  console.log('Humano juega:', hand[0].nombreDisplay);
  engine.playCard('player-0', 0);
}

function wait(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

async function main(): Promise<void> {
  // Repetir hasta cubrir 2 tricks completos
  for (let i = 0; i < 12; i++) {
    const s: any = engine.getState();
    console.log(`--- iter ${i}: phase=${s.phase} turno=${s.currentTurnPlayerId} round=${s.currentRound} trick=[${(s.currentTrick||[]).map((p:any)=>p.playerId).join(',')}]`);
    if (s.phase === 'game-over' || s.phase === 'round-over') break;

    if (s.currentTurnPlayerId === 'player-0') {
      // Humano: jugar carta (a veces cantar truco primero para ejercitar el path)
      if (s.currentRound === 0 && (s.currentTrick||[]).length === 0 && s.truco.level === 0 && s.envido.phase === 'none') {
        console.log('Humano canta TRUCO');
        engine['challengeTruco']('player-0');
      }
      playForHuman();
      // Simular clicks en paneles de respuesta si aparecen
      const st: any = engine.getState();
      if (st.truco.level > 0 && !st.truco.accepted && st.truco.lastChallengerTeam === 0) {
        console.log('Humano acepta truco (respondTruco true)');
        engine.respondTruco('player-0', true);
      }
    } else if (s.currentTurnPlayerId === 'player-1') {
      // AI: jugar carta directo (sincrónico, sin esperar evento)
      const hand = s.hands['player-1'] || [];
      if (hand.length > 0) {
        console.log('AI juega:', hand[0].nombreDisplay);
        engine.playCard('player-1', 0);
      }
    }
    await wait(30);
  }

  const s: any = engine.getState();
  console.log('\n=== RESULTADO ===');
  console.log('phase final:', s.phase, '| scores:', JSON.stringify(s.scores));
  console.log('AI turns emitidos:', aiTurns.length, JSON.stringify(aiTurns.map((a:any)=>a.playerId)));
  console.log('\nEVENTOS (últimos 25):');
  console.log(events.slice(-25).join('\n'));
}

main().then(() => process.exit(0)).catch(e => { console.error('ERROR:', e.message); process.exit(1); });
