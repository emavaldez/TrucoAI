// DecisionEngine - AI decision-making logic for Truco

import { AIPlayer } from './AIPlayer.js';
import { GameEngine } from '../core/GameEngine.js';
import type { Card } from '../core/Card.js';
import type { RoundState } from '../core/GameEngine.js';

export interface AIAction {
  type: 'play-card' | 'challenge-truco' | 'accept-truco' | 'reject-truco'
    | 'challenge-envido' | 'resolve-envido' | 'pass';
  cardIndex?: number;
  delay?: number;
}

/**
 * DecisionEngine coordinates AI actions based on game state.
 * It uses AIPlayer for card selection and decision thresholds,
 * and GameEngine to execute actions.
 */
export class DecisionEngine {
  private ai: AIPlayer;
  private gameEngine!: GameEngine;

  constructor(difficulty: 'easy' | 'normal' | 'hard' = 'normal') {
    this.ai = new AIPlayer(difficulty);
  }

  setGameEngine(engine: GameEngine): void {
    this.gameEngine = engine;
    this.ai.setGameEngine(engine);
  }

  /**
   * Evaluate the current game state and return the next AI action.
   * This is the main entry point called after each game event.
   */
  evaluate(aiHand: Card[]): AIAction | null {
    if (!this.gameEngine) return null;

    const phase = this.gameEngine.phaseValue;

    // If truco is pending, decide whether to accept or reject
    if (this.gameEngine['trucoPending']) {
      if (this.ai.shouldAcceptTruco(aiHand)) {
        return { type: 'accept-truco' };
      }
      return { type: 'reject-truco' };
    }

    // If envido is pending, resolve it
    if (this.gameEngine['envidoPending']) {
      return { type: 'resolve-envido' };
    }

    // If playing, decide card to play or whether to challenge
    if (phase === 'playing') {
      return this.decideAction(aiHand);
    }

    return null;
  }

  /**
   * Decide what action to take during playing phase
   */
  private decideAction(aiHand: Card[]): AIAction {
    const round = this.gameEngine.roundState;
    if (!round) return { type: 'pass' };

    // Check if we should challenge truco
    const shouldChallenge = this.shouldChallengeTruco(aiHand, round);
    if (shouldChallenge) {
      return { type: 'challenge-truco' };
    }

    // Check if we should challenge envido
    const shouldChallengeEnvido = this.ai.shouldChallengeEnvido(aiHand);
    if (shouldChallengeEnvido) {
      return { type: 'challenge-envido' };
    }

    // Choose card to play
    const cardIndex = this.ai.chooseCard(
      aiHand,
      round.currentTrick,
      this.gameEngine['playerWonLastTrick']
    );

    return { type: 'play-card', cardIndex };
  }

  /**
   * Determine if AI should challenge truco based on hand strength and game state
   */
  private shouldChallengeTruco(aiHand: Card[], round: RoundState): boolean {
    const currentLevel = this.gameEngine.currentTrucoLevel;

    // Only challenge if we have cards to play
    if (aiHand.length === 0) return false;

    // Check if AI has already played a card this trick (can't challenge after playing)
    const currentTrick = round.playedCards[round.currentTrick];
    if (currentTrick && currentTrick.ai) return false;

    return this.ai.shouldChallengeTruco(aiHand, currentLevel);
  }

  /**
   * Execute an AI action on the game engine
   */
  execute(action: AIAction): void {
    if (!this.gameEngine) return;

    switch (action.type) {
      case 'play-card':
        if (action.cardIndex !== undefined) {
          this.gameEngine.aiPlayCard(action.cardIndex);
        }
        break;

      case 'challenge-truco':
        this.gameEngine.aiChallengeTruco();
        break;

      case 'accept-truco':
        this.gameEngine.acceptTruco();
        break;

      case 'reject-truco':
        this.gameEngine.rejectTruco();
        break;

      case 'challenge-envido':
        this.gameEngine.challengeEnvido();
        break;

      case 'resolve-envido':
        this.gameEngine.resolveEnvido();
        break;

      case 'pass':
        // No action
        break;
    }
  }

  /**
   * Get AI difficulty
   */
  get difficulty(): 'easy' | 'normal' | 'hard' {
    return this.ai['difficulty'];
  }

  /**
   * Set AI difficulty
   */
  setDifficulty(difficulty: 'easy' | 'normal' | 'hard'): void {
    this.ai = new AIPlayer(difficulty);
    this.ai.setGameEngine(this.gameEngine);
  }
}
