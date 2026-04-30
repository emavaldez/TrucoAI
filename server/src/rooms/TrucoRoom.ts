// Truco Room - Colyseus room for multiplayer truco games

import { Room, Client } from "@colyseus/core";
import { TrucoState, PlayerState } from "../state/TrucoState.js";
import type { GameMode, Difficulty, PlayerCount } from "../../src/types.js";

interface PlayerData {
  name: string;
  isHuman: boolean;
  difficulty: Difficulty;
  team: number;
}

export class TrucoRoom extends Room<TrucoState> {
  state: TrucoState;
  private players: Map<string, PlayerData> = new Map();
  private gameStarted: boolean = false;
  private maxPlayers: number = 2;

  // Game engine reference (server-side authoritative)
  private gamePhase: string = "waiting";

  constructor() {
    super();

    this.state = new TrucoState();
    this.state.playerCount = 2;
    this.state.mode = "multiplayer";

    // Set up max clients
    this.maxClients = 6;
  }

  onCreate(options: any) {
    console.log("TrucoRoom created with options:", options);

    // Set room code from options
    if (options.roomCode) {
      this.state.roomCode = options.roomCode;
    }

    // Set player count from options
    if (options.playerCount) {
      this.state.playerCount = options.playerCount as number;
      this.maxPlayers = options.playerCount as number;
    }

    // Set up max clients based on player count
    this.maxClients = this.maxPlayers;

    // Set up simulation interval for game tick
    this.setSimulationInterval(() => {
      // Game logic runs on events, not continuous simulation
    });

    // Message handlers
    this.onMessage("join", (client, message) => {
      console.log(`Client ${client.sessionId} requested to join`);
    });

    this.onMessage("play-card", (client, message) => {
      this.handlePlayCard(client, message);
    });

    this.onMessage("declare-envido", (client) => {
      this.handleDeclareEnvido(client);
    });

    this.onMessage("respond-envido", (client, message) => {
      this.handleRespondEnvido(client, message);
    });

    this.onMessage("declare-truco", (client) => {
      this.handleDeclareTruco(client);
    });

    this.onMessage("respond-truco", (client, message) => {
      this.handleRespondTruco(client, message);
    });

    this.onMessage("fold", (client) => {
      this.handleFold(client);
    });

    this.onMessage("chat", (client, message) => {
      const playerName = this.players.get(client.sessionId)?.name || "Unknown";
      this.broadcast("chat-message", { sender: playerName, message });
    });

    this.onMessage("ready", (client) => {
      this.handleReady(client);
    });

    this.onMessage("start-game", (client) => {
      this.handleStartGame(client);
    });

    // Lobby events
    this.on("join", (client) => {
      console.log(`Client ${client.sessionId} joined room ${this.roomId}`);
    });

    this.on("leave", (client, condition) => {
      console.log(`Client ${client.sessionId} left room ${this.roomId}`);
      this.handlePlayerLeave(client);
    });

    this.on("dispose", () => {
      console.log(`Room ${this.roomId} disposed`);
    });
  }

  private onAuth(token: any): Promise<boolean> {
    // Simple auth - accept all for now
    return Promise.resolve(true);
  }

  async onJoin(client: Client, options?: any) {
    const sessionId = client.sessionId;

    // Create player state
    const playerState = new PlayerState();
    playerState.id = sessionId;
    playerState.name = options?.name || `Jugador ${this.players.size + 1}`;
    playerState.isHuman = true;
    playerState.isAI = false;
    playerState.team = this.players.size % 2; // Alternate teams

    this.state.players.set(sessionId, playerState);
    this.players.set(sessionId, {
      name: playerState.name,
      isHuman: true,
      difficulty: "normal",
      team: playerState.team,
    });

    // Update UI
    this.updatePlayerCount();

    // If solo mode, add AI players
    if (this.state.mode === "solo") {
      await this.addAIPlayers();
    }

    // If all players ready, start game
    if (this.players.size >= this.maxPlayers) {
      // Auto-start after a short delay
      setTimeout(() => {
        if (!this.gameStarted) {
          this.startGame();
        }
      }, 2000);
    }

    // Send current state to new player
    client.send("state-update", this.getStateSnapshot());
  }

  private async addAIPlayers() {
    const aiNames = ["El Carpincho", "La Roca", "Messi", "El Diego", "Boris", "Guido"];
    const difficulties: Difficulty[] = ["easy", "normal", "hard"];

    while (this.players.size < this.maxPlayers) {
      const aiIndex = this.players.size - 1; // Subtract human players
      if (aiIndex < 0) aiIndex = 0;

      const sessionId = `ai-${this.players.size}`;
      const playerState = new PlayerState();
      playerState.id = sessionId;
      playerState.name = aiNames[aiIndex % aiNames.length];
      playerState.isHuman = false;
      playerState.isAI = true;
      playerState.difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];
      playerState.team = this.players.size % 2;

      this.state.players.set(sessionId, playerState);
      this.players.set(sessionId, {
        name: playerState.name,
        isHuman: false,
        difficulty: playerState.difficulty as Difficulty,
        team: playerState.team,
      });

      this.updatePlayerCount();
    }
  }

  private updatePlayerCount() {
    const humanPlayers = Array.from(this.players.values()).filter(p => p.isHuman).length;
    const aiPlayers = Array.from(this.players.values()).filter(p => !p.isHuman).length;

    this.broadcast("player-count", {
      total: this.players.size,
      humans: humanPlayers,
      ais: aiPlayers,
    });
  }

  private handlePlayerLeave(client: Client) {
    const sessionId = client.sessionId;
    
    // Remove player from state
    this.state.players.delete(sessionId);
    this.players.delete(sessionId);

    // Notify remaining players
    this.broadcast("player-left", { playerId: sessionId });
    
    // Check if room is empty
    if (this.state.players.size === 0) {
      this.broadcast("room-empty", {});
    }
  }

  private handlePlayCard(client: Client, message: { cardIndex: number }) {
    const sessionId = client.sessionId;
    const playerState = this.state.players.get(sessionId);

    if (!playerState || !playerState.isHuman) return;
    if (this.gamePhase !== "playing") return;

    // Validate turn
    if (this.state.currentTurn !== sessionId) {
      client.send("error", { message: "No es tu turno" });
      return;
    }

    // Process card play (simplified - actual game logic would be in a separate engine)
    this.broadcast("card-played", {
      playerId: sessionId,
      cardIndex: message.cardIndex,
    });

    // Move to next player
    this.nextTurn();
  }

  private handleDeclareEnvido(client: Client) {
    const sessionId = client.sessionId;

    if (this.gamePhase !== "playing") return;

    this.broadcast("envido-declared", {
      playerId: sessionId,
    });

    this.gamePhase = "envido-pending";
  }

  private handleRespondEnvido(client: Client, message: { accept: boolean }) {
    const sessionId = client.sessionId;

    this.broadcast("envido-responded", {
      playerId: sessionId,
      accept: message.accept,
    });

    this.gamePhase = "playing";
  }

  private handleDeclareTruco(client: Client) {
    const sessionId = client.sessionId;

    if (this.gamePhase !== "playing") return;

    this.state.trucoLevel = Math.min(3, this.state.trucoLevel + 1);

    this.broadcast("truco-declared", {
      playerId: sessionId,
      level: this.state.trucoLevel,
    });

    this.gamePhase = "truco-pending";
  }

  private handleRespondTruco(client: Client, message: { accept: boolean }) {
    const sessionId = client.sessionId;

    this.broadcast("truco-responded", {
      playerId: sessionId,
      accept: message.accept,
    });

    if (!message.accept) {
      // Opponent gets points - round ends
      this.gamePhase = "round-over";
    } else {
      this.gamePhase = "playing";
    }
  }

  private handleFold(client: Client) {
    const sessionId = client.sessionId;

    this.broadcast("player-folded", {
      playerId: sessionId,
    });

    this.gamePhase = "round-over";
  }

  private handleReady(client: Client) {
    // Mark player as ready (for multiplayer lobby)
    this.broadcast("player-ready", {
      playerId: client.sessionId,
    });
  }

  private handleStartGame(client: Client) {
    this.startGame();
  }

  private startGame() {
    if (this.gameStarted) return;
    this.gameStarted = true;
    this.gamePhase = "dealing";

    // Deal cards to all players
    const playerIds = Array.from(this.players.keys());

    // Simple deal: 3 cards to each player
    for (const playerId of playerIds) {
      const playerState = this.state.players.get(playerId);
      if (playerState) {
        // Generate random cards for the player
        const suits = ["espada", "basto", "oro", "copa"] as const;
        const numbers = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12] as const;

        playerState.myCards = [];
        for (let i = 0; i < 3; i++) {
          const suit = suits[Math.floor(Math.random() * suits.length)];
          const number = numbers[Math.floor(Math.random() * numbers.length)];
          playerState.myCards.push(`${number}-${suit}`);
        }

        playerState.cardsCount = 3;
      }
    }

    // Assign mano (first player)
    if (playerIds.length > 0) {
      const manoId = playerIds[0];
      this.state.currentTurn = manoId;
      const manoPlayer = this.state.players.get(manoId);
      if (manoPlayer) {
        manoPlayer.isHand = true;
      }
    }

    this.state.phase = "dealing";
    this.broadcast("game-started", {
      players: playerIds,
      currentTurn: manoId,
    });

    // Start first round after delay
    setTimeout(() => {
      this.gamePhase = "playing";
      this.state.phase = "playing";
      this.broadcast("round-started", {
        currentTurn: this.state.currentTurn,
      });
    }, 1500);
  }

  private nextTurn() {
    const playerIds = Array.from(this.players.keys());
    const currentIndex = playerIds.indexOf(this.state.currentTurn);
    const nextIndex = (currentIndex + 1) % playerIds.length;

    this.state.currentTurn = playerIds[nextIndex];
    this.broadcast("turn-changed", {
      currentPlayer: this.state.currentTurn,
    });

    // If next player is AI, trigger AI action after delay
    const nextPlayer = this.state.players.get(this.state.currentTurn);
    if (nextPlayer?.isAI) {
      setTimeout(() => {
        this.triggerAIAction(nextPlayer.id);
      }, 1000 + Math.random() * 1500);
    }
  }

  private triggerAIAction(playerId: string) {
    // Simple AI: play random card or make a decision
    const actions = ["play-card", "declare-envido", "declare-truco"];
    const action = actions[Math.floor(Math.random() * actions.length)];

    if (action === "play-card") {
      const cardIndex = Math.floor(Math.random() * 3);
      this.broadcast("ai-action", {
        playerId,
        action: "play-card",
        cardIndex,
      });

      this.nextTurn();
    } else if (action === "declare-envido") {
      this.broadcast("ai-action", {
        playerId,
        action: "declare-envido",
      });
    } else if (action === "declare-truco") {
      this.broadcast("ai-action", {
        playerId,
        action: "declare-truco",
      });
    }
  }

  private getStateSnapshot(): any {
    return {
      phase: this.state.phase,
      trucoLevel: this.state.trucoLevel,
      currentTurn: this.state.currentTurn,
      players: Array.from(this.state.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        points: p.points,
        isHuman: p.isHuman,
        isAI: p.isAI,
        team: p.team,
        isHand: p.isHand,
        cardsCount: p.cardsCount,
      })),
    };
  }

  onLeave(client: Client, options?: any) {
    // Clean up player state
    this.state.players.delete(client.sessionId);
    this.players.delete(client.sessionId);

    // Notify remaining players
    this.broadcast("player-left", {
      playerId: client.sessionId,
    });

    // If room is empty, dispose after delay
    if (this.state.players.size === 0) {
      setTimeout(() => this.disconnect(), 5000);
    }
  }

  onDispose() {
    console.log(`Room ${this.roomId} has been disposed`);
  }
}
