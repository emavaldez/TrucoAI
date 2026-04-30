// GameClient - Colyseus client for multiplayer

import { Client } from "@colyseus/js-sdk";
import type { Room } from "@colyseus/js-sdk";

export interface GameClientEvents {
  "state-update": any;
  "player-count": { total: number; humans: number; ais: number };
  "game-started": { players: string[]; currentTurn: string };
  "round-started": { currentTurn: string };
  "turn-changed": { currentPlayer: string };
  "card-played": { playerId: string; cardIndex: number };
  "envido-declared": { playerId: string };
  "envido-responded": { playerId: string; accept: boolean };
  "truco-declared": { playerId: string; level: number };
  "truco-responded": { playerId: string; accept: boolean };
  "player-folded": { playerId: string };
  "ai-action": { playerId: string; action: string; cardIndex?: number };
  "player-ready": { playerId: string };
  "player-left": { playerId: string };
  "room-empty": {};
  "chat-message": { sender: string; message: string };
  "error": { message: string };
}

export class GameClient {
  private client: Client;
  private room: Room | null = null;
  private isConnected: boolean = false;

  // Event callbacks
  onStateUpdate?: (state: any) => void;
  onPlayerCount?: (data: { total: number; humans: number; ais: number }) => void;
  onGameStarted?: (data: { players: string[]; currentTurn: string }) => void;
  onRoundStarted?: (data: { currentTurn: string }) => void;
  onTurnChanged?: (data: { currentPlayer: string }) => void;
  onCardPlayed?: (data: { playerId: string; cardIndex: number }) => void;
  onEnvidoDeclared?: (data: { playerId: string }) => void;
  onEnvidoResponded?: (data: { playerId: string; accept: boolean }) => void;
  onTrucoDeclared?: (data: { playerId: string; level: number }) => void;
  onTrucoResponded?: (data: { playerId: string; accept: boolean }) => void;
  onPlayerFolded?: (data: { playerId: string }) => void;
  onAIAction?: (data: { playerId: string; action: string; cardIndex?: number }) => void;
  onPlayerReady?: (data: { playerId: string }) => void;
  onPlayerLeft?: (data: { playerId: string }) => void;
  onRoomEmpty?: () => void;
  onChatMessage?: (data: { sender: string; message: string }) => void;
  onError?: (data: { message: string }) => void;

  constructor() {
    this.client = new Client();
  }

  /** Connect to the game server */
  async connect(serverUrl: string = "ws://localhost:2567"): Promise<void> {
    try {
      // Test connection
      await this.client.ping(serverUrl);
      console.log(`Connected to ${serverUrl}`);
      this.isConnected = true;
    } catch (err) {
      console.error("Failed to connect to server:", err);
      throw err;
    }
  }

  /** Create a new room */
  async createRoom(options: {
    name?: string;
    playerCount?: number;
    mode?: string;
  }): Promise<Room> {
    const roomCode = this.generateRoomCode();

    this.room = await this.client.create("truco", {
      name: options.name || "Jugador 1",
      playerCount: options.playerCount || 2,
      roomCode,
    });

    this.setupRoomListeners();
    return this.room;
  }

  /** Join an existing room */
  async joinRoom(roomCode: string, options?: { name?: string }): Promise<Room> {
    // First, list rooms to find the right one
    const rooms = await this.client.getList("truco");

    // Find room with matching code (simplified - in production, use room metadata)
    let targetRoom: any = null;
    for (const roomInfo of rooms.rooms) {
      // Match by some criteria
      if (roomInfo.clients > 0) {
        targetRoom = roomInfo;
        break;
      }
    }

    if (!targetRoom) {
      throw new Error("Room not found");
    }

    this.room = await this.client.joinById(targetRoom.id, {
      name: options?.name || "Jugador",
    });

    this.setupRoomListeners();
    return this.room;
  }

  /** Join by room ID directly */
  async joinRoomById(roomId: string, options?: { name?: string }): Promise<Room> {
    this.room = await this.client.joinById(roomId, {
      name: options?.name || "Jugador",
    });

    this.setupRoomListeners();
    return this.room;
  }

  private setupRoomListeners(): void {
    if (!this.room) return;

    this.room.onMessage("state-update", (state) => {
      if (this.onStateUpdate) this.onStateUpdate(state as any);
    });

    this.room.onMessage("player-count", (data) => {
      if (this.onPlayerCount) this.onPlayerCount(data as any);
    });

    this.room.onMessage("game-started", (data) => {
      if (this.onGameStarted) this.onGameStarted(data as any);
    });

    this.room.onMessage("round-started", (data) => {
      if (this.onRoundStarted) this.onRoundStarted(data as any);
    });

    this.room.onMessage("turn-changed", (data) => {
      if (this.onTurnChanged) this.onTurnChanged(data as any);
    });

    this.room.onMessage("card-played", (data) => {
      if (this.onCardPlayed) this.onCardPlayed(data as any);
    });

    this.room.onMessage("envido-declared", (data) => {
      if (this.onEnvidoDeclared) this.onEnvidoDeclared(data as any);
    });

    this.room.onMessage("envido-responded", (data) => {
      if (this.onEnvidoResponded) this.onEnvidoResponded(data as any);
    });

    this.room.onMessage("truco-declared", (data) => {
      if (this.onTrucoDeclared) this.onTrucoDeclared(data as any);
    });

    this.room.onMessage("truco-responded", (data) => {
      if (this.onTrucoResponded) this.onTrucoResponded(data as any);
    });

    this.room.onMessage("player-folded", (data) => {
      if (this.onPlayerFolded) this.onPlayerFolded(data as any);
    });

    this.room.onMessage("ai-action", (data) => {
      if (this.onAIAction) this.onAIAction(data as any);
    });

    this.room.onMessage("player-ready", (data) => {
      if (this.onPlayerReady) this.onPlayerReady(data as any);
    });

    this.room.onMessage("player-left", (data) => {
      if (this.onPlayerLeft) this.onPlayerLeft(data as any);
    });

    this.room.onMessage("room-empty", () => {
      if (this.onRoomEmpty) this.onRoomEmpty();
    });

    this.room.onMessage("chat-message", (data) => {
      if (this.onChatMessage) this.onChatMessage(data as any);
    });

    this.room.onMessage("error", (data) => {
      if (this.onError) this.onError(data as any);
    });

    this.room.onLeave((code) => {
      console.log("Left room:", code);
      this.isConnected = false;
    });
  }

  /** Send a card play action */
  playCard(cardIndex: number): void {
    if (this.room) {
      this.room.send("play-card", { cardIndex });
    }
  }

  /** Declare envido */
  declareEnvido(): void {
    if (this.room) {
      this.room.send("declare-envido", {});
    }
  }

  /** Respond to envido */
  respondEnvido(accept: boolean): void {
    if (this.room) {
      this.room.send("respond-envido", { accept });
    }
  }

  /** Declare truco */
  declareTruco(): void {
    if (this.room) {
      this.room.send("declare-truco", {});
    }
  }

  /** Respond to truco */
  respondTruco(accept: boolean): void {
    if (this.room) {
      this.room.send("respond-truco", { accept });
    }
  }

  /** Fold (ir al mazo) */
  fold(): void {
    if (this.room) {
      this.room.send("fold", {});
    }
  }

  /** Send chat message */
  sendChat(message: string): void {
    if (this.room) {
      this.room.send("chat", message);
    }
  }

  /** Mark as ready */
  ready(): void {
    if (this.room) {
      this.room.send("ready", {});
    }
  }

  /** Start the game */
  startGame(): void {
    if (this.room) {
      this.room.send("start-game", {});
    }
  }

  /** Leave the room */
  leave(): void {
    if (this.room) {
      this.room.leave();
      this.room = null;
      this.isConnected = false;
    }
  }

  /** Get current room */
  getRoom(): Room | null {
    return this.room;
  }

  /** Check if connected */
  isConnectedToRoom(): boolean {
    return this.room !== null;
  }

  /** Generate a random room code */
  private generateRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  /** Dispose */
  dispose(): void {
    this.leave();
  }
}
