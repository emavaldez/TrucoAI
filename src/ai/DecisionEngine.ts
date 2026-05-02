// DecisionEngine - AI decision-making logic for Truco
// Coordinates AI actions based on game state

import { AIPlayer } from './AIPlayer.js';
import { GameEngine } from '../core/GameEngine.js';
import type { Card } from '../core/Card.js';
import type { RoundState } from '../core/GameEngine.js';

export interface AIAction {
  type: 'play-card' | 'challenge-truco' | 'challenge-envido' | 'pass';
  cardIndex?: number;
  delay?: number;
}

/**
 * DecisionEngine coordinates AI actions based on game state.
 */
export class DecisionEngine {
  private ai: AIPlayer;
  private gameEngine!: GameEngine;

  constructor(difficulty: 'easy' | 'normal' | 'hard' = 'normal') {
    this.ai = new AIPlayer(difficulty);
  }

  setGameEngine(engine: GameEngine): void {
    this.gameEngine = engine;
  }

  /**
   * Evaluate the current game state and return the next AI action.
   */
  evaluate(aiHand: Card[], aiPlayerId: string): AIAction | null {
    if (!this.gameEngine) return null;

    const phase = this.gameEngine.phase;

    // Only act during playing phase
    if (phase === 'playing') {
      return this.decideAction(aiHand, aiPlayerId);
    }

    return null;
  }

  /**
   * Decide what action to take during playing phase
   */
  private decideAction(aiHand: Card[], aiPlayerId: string): AIAction {
    const round = this.gameEngine.roundState;
    if (!round) return { type: 'pass' };

    // Check if AI has already played a card this trick (can't play after)
    const currentTrick = round.playedCards[round.currentTrick];
    if (currentTrick && currentTrick[aiPlayerId]) return { type: 'pass' };

    // ── No proactive challenges ────────────────────────────
    // AI only responds to human-initiated challenges (per design)
    // Choose card to play
    const wonLastTrick = round.trickWinners.length > 0
      ? round.trickWinners[round.trickWinners.length - 1] === aiPlayerId
      : false;
    const cardIndex = this.ai.chooseCard(aiHand, round.currentTrick, wonLastTrick);

    return { type: 'play-card', cardIndex };
  }

  /**
   * Determine if AI should challenge truco based on hand strength and game state
   */
  private shouldChallengeTruco(aiHand: Card[], round: RoundState, aiPlayerId: string): boolean {
    const currentLevel = this.gameEngine.currentTrucoLevel;

    // Only challenge if we have cards to play and haven't reached max level
    if (aiHand.length === 0) return false;
    if (currentLevel >= 3) return false; // Already at vale 4

    // Check if AI has already played a card this trick (can't challenge after playing)
    const currentTrick = round.playedCards[round.currentTrick];
    if (currentTrick && currentTrick[aiPlayerId]) return false;

    return this.ai.shouldChallengeTruco(aiHand, currentLevel);
  }

  /**
   * Determine if AI should challenge envido based on hand strength
   */
  private shouldChallengeEnvido(aiHand: Card[], round: RoundState, aiPlayerId: string): boolean {
    // Only challenge on first trick (before any cards played)
    if (round.currentTrick !== 0) return false;

    // Check if AI has already played a card this trick
    const currentTrick = round.playedCards[round.currentTrick];
    if (currentTrick && currentTrick[aiPlayerId]) return false;

    // Check if envido hasn't been challenged yet
    if (this.gameEngine.envidoState.phase !== 'none') return false;

    return this.ai.shouldChallengeEnvido(aiHand);
  }
}
