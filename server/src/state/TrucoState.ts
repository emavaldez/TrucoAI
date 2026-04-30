// Colyseus Schema for Truco game state synchronization

import { schema, type, MapSchema } from "@colyseus/schema";
import type { Client } from "@colyseus/core";

@schema
export class PlayerState extends schema.Object {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("number") points: number = 0;
  @type("boolean") isHuman: boolean = false;
  @type("boolean") isAI: boolean = false;
  @type("string") difficulty: string = "normal";
  @type("number") team: number = 0;
  @type("boolean") isHand: boolean = false;

  // Card state (visible to owner, hidden to others)
  @type("number") cardsCount: number = 0;
  @type("boolean") hasCards: boolean = true;

  // Played cards (visible to all)
  @type("number") playedCardsCount: number = 0;

  // For human players, store their actual cards (only visible to them)
  @type(["string"]) myCards: string[] = []; // serialized card strings
}

@schema
export class TrucoState extends schema.Object {
  @type("string") phase: string = "menu"; // menu, dealing, playing, envido-pending, truco-pending, round-over, game-over

  @type("number") trucoLevel: number = 0; // 0-3
  @type("number") envidoLevel: number = 0;
  @type("boolean") finishedEnvido: boolean = false;

  @type("string") currentTurn: string = ""; // playerId of whose turn it is
  @type("number") roundNumber: number = 0;

  // Players map
  @type({ map: PlayerState }) players: MapSchema<PlayerState> = new MapSchema<PlayerState>();

  // Game config
  @type("number") playerCount: number = 2;
  @type("string") mode: string = "solo"; // solo, multiplayer

  // Winner info
  @type("string") winner: string = "";

  // Event log (for UI updates)
  @type("string") lastEvent: string = "";
  @type("object") eventData: any = null;

  // Room code for multiplayer
  @type("string") roomCode: string = "";

  getPlayers(): PlayerState[] {
    return Array.from(this.players.values());
  }

  getPlayerById(id: string): PlayerState | undefined {
    return this.players.get(id);
  }

  getTeamScore(teamId: number): number {
    let total = 0;
    for (const player of this.players.values()) {
      if (player.team === teamId) total += player.points;
    }
    return total;
  }

  getAllScores(): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const player of this.players.values()) {
      scores[player.id] = player.points;
    }
    return scores;
  }
}
