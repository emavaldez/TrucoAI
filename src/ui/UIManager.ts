// UI Manager - handles all HTML UI elements

import type { GameMode, Difficulty } from '../types.js';

export class UIManager {
  // Menu elements
  private mainMenu: HTMLElement;
  private hud: HTMLElement;
  private waitingScreen: HTMLElement;
  private gameOverScreen: HTMLElement;

  // Score displays
  private scoreTop: HTMLElement;
  private scoreBottom: HTMLElement;
  private nameTop: HTMLElement;
  private nameBottom: HTMLElement;
  private pointsTop: HTMLElement;
  private pointsBottom: HTMLElement;

  // Game info
  private turnIndicator: HTMLElement;
  private trucoCounter: HTMLElement;
  private trucoLevel: HTMLElement;
  private messageDisplay: HTMLElement;

  // Card hand (human player)
  private cardHand: HTMLElement;
  private actionBar: HTMLElement;

  // Chat
  private chatPanel: HTMLElement;
  private chatToggle: HTMLElement;
  private chatMessages: HTMLElement;
  private chatInput: HTMLElement;

  // Multiplayer
  private roomCodeDisplay: HTMLElement;
  private difficultySection: HTMLElement;
  private multiplayerSection: HTMLElement;

  // Game over
  private gameOverMessage: HTMLElement;

  constructor() {
    this.mainMenu = document.getElementById('main-menu')!;
    this.hud = document.getElementById('hud')!;
    this.waitingScreen = document.getElementById('waiting-screen')!;
    this.gameOverScreen = document.getElementById('game-over')!;

    this.scoreTop = document.getElementById('score-top')!;
    this.scoreBottom = document.getElementById('score-bottom')!;
    this.nameTop = document.getElementById('name-top')!;
    this.nameBottom = document.getElementById('name-bottom')!;
    this.pointsTop = document.getElementById('points-top')!;
    this.pointsBottom = document.getElementById('points-bottom')!;

    this.turnIndicator = document.getElementById('turn-indicator')!;
    this.trucoCounter = document.getElementById('truco-counter')!;
    this.trucoLevel = document.getElementById('truco-level')!;
    this.messageDisplay = document.getElementById('message-display')!;

    this.cardHand = document.getElementById('card-hand')!;
    this.actionBar = document.getElementById('action-bar')!;

    this.chatPanel = document.getElementById('chat-panel')!;
    this.chatToggle = document.getElementById('chat-toggle')!;
    this.chatMessages = document.getElementById('chat-messages')!;
    this.chatInput = document.getElementById('chat-input')!;

    this.roomCodeDisplay = document.getElementById('room-code-display')!;
    this.difficultySection = document.getElementById('difficulty-section')!;
    this.multiplayerSection = document.getElementById('multiplayer-section')!;

    this.gameOverMessage = document.getElementById('game-over-message')!;
  }

  // ==================== MENU ====================

  showMenu(): void {
    this.mainMenu.style.display = 'flex';
    this.hud.style.display = 'none';
    this.waitingScreen.style.display = 'none';
    this.gameOverScreen.style.display = 'none';
  }

  hideMenu(): void {
    this.mainMenu.style.display = 'none';
  }

  showHUD(): void {
    this.mainMenu.style.display = 'none';
    this.hud.style.display = 'block';
  }

  setDifficultySectionVisible(visible: boolean): void {
    this.difficultySection.style.display = visible ? 'block' : 'none';
  }

  setMultiplayerSectionVisible(visible: boolean): void {
    this.multiplayerSection.style.display = visible ? 'block' : 'none';
  }

  setRoomCodeInputVisible(visible: boolean): void {
    const input = document.getElementById('room-code-input') as HTMLInputElement;
    if (input) input.style.display = visible ? 'block' : 'none';
  }

  // ==================== HUD ====================

  updateScores(scores: Record<string, number>, names: Record<string, string>, teams: Record<string, number>): void {
    // Group by team
    const team0Names: string[] = [];
    const team1Names: string[] = [];

    for (const [id, score] of Object.entries(scores)) {
      const name = names[id] || id;
      if (teams[id] === 0) team0Names.push(`${name}: ${score}`);
      else team1Names.push(`${name}: ${score}`);
    }

    // Display top and bottom scores
    if (team1Names.length > 0) {
      this.nameTop.textContent = team1Names.join(' & ');
      this.pointsTop.textContent = team1Names.map(n => n.split(': ').pop()!).join(' / ');
    }

    if (team0Names.length > 0) {
      this.nameBottom.textContent = team0Names.join(' & ');
      this.pointsBottom.textContent = team0Names.map(n => n.split(': ').pop()!).join(' / ');
    }
  }

  updateSimpleScores(team0Score: number, team1Score: number, team0Name: string, team1Name: string): void {
    this.nameTop.textContent = team1Name;
    this.pointsTop.textContent = team1Score.toString();
    this.nameBottom.textContent = team0Name;
    this.pointsBottom.textContent = team0Score.toString();
  }

  setTurnIndicator(text: string): void {
    this.turnIndicator.textContent = text;
    this.turnIndicator.style.display = 'block';
  }

  hideTurnIndicator(): void {
    this.turnIndicator.style.display = 'none';
  }

  setTrucoLevel(level: number): void {
    const labels = ['—', 'TRUCO', 'RETRUCO', 'VALE 4'];
    this.trucoLevel.textContent = labels[level] || '—';

    if (level > 0) {
      this.trucoCounter.style.display = 'block';
    } else {
      this.trucoCounter.style.display = 'none';
    }
  }

  showMessage(text: string, duration: number = 2000): void {
    this.messageDisplay.textContent = text;
    this.messageDisplay.style.display = 'block';

    setTimeout(() => {
      this.messageDisplay.style.display = 'none';
    }, duration);
  }

  hideMessage(): void {
    this.messageDisplay.style.display = 'none';
  }

  // ==================== CARDS ====================

  renderCardHand(cards: Array<{ number: number; suit: string }>, enabled: boolean, onCardClick: (index: number) => void): void {
    this.cardHand.innerHTML = '';

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const slot = document.createElement('div');
      slot.className = 'card-slot';

      // Create card visual using canvas
      const canvas = document.createElement('canvas');
      canvas.width = 90;
      canvas.height = 130;
      const ctx = canvas.getContext('2d')!;

      // Card background
      ctx.fillStyle = '#ffffff';
      this.roundRect(ctx, 0, 0, 90, 130, 8);
      ctx.fill();

      // Border
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      this.roundRect(ctx, 2, 2, 86, 126, 6);
      ctx.stroke();

      // Suit color
      const suitColors: Record<string, string> = {
        espada: '#2c3e50',
        basto: '#2d5016',
        oro: '#b8860b',
        copa: '#1a3a5c',
      };
      const color = suitColors[card.suit] || '#333';

      // Suit symbols
      const suitSymbols: Record<string, string> = {
        espada: '⚔',
        basto: '🌿',
        oro: '☀',
        copa: '🏆',
      };

      // Top-left
      ctx.fillStyle = color;
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(card.number.toString(), 8, 24);
      ctx.font = '16px Arial';
      ctx.fillText(suitSymbols[card.suit] || '?', 8, 42);

      // Center
      ctx.font = '36px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(suitSymbols[card.suit] || '?', 45, 75);

      // Bottom-right (rotated)
      ctx.save();
      ctx.translate(82, 106);
      ctx.rotate(Math.PI);
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'left';
      ctx.fillStyle = color;
      ctx.fillText(card.number.toString(), 0, 0);
      ctx.font = '16px Arial';
      ctx.fillText(suitSymbols[card.suit] || '?', 0, 18);
      ctx.restore();

      slot.appendChild(canvas);

      if (!enabled) {
        slot.classList.add('disabled');
      } else {
        slot.addEventListener('click', () => onCardClick(i));
      }

      this.cardHand.appendChild(slot);
    }
  }

  renderOpponentCards(count: number): void {
    // Face-down cards for opponent(s)
    const existing = this.cardHand.querySelectorAll('.opponent-card');
    existing.forEach(el => el.remove());

    for (let i = 0; i < count; i++) {
      const back = document.createElement('div');
      back.className = 'card-back opponent-card';
      this.cardHand.appendChild(back);
    }
  }

  // ==================== ACTION BUTTONS ====================

  setActionButtonsEnabled(enabled: boolean): void {
    const buttons = this.actionBar.querySelectorAll('.action-btn');
    buttons.forEach(btn => {
      (btn as HTMLButtonElement).disabled = !enabled;
    });
  }

  hideActionButtons(): void {
    this.actionBar.style.display = 'none';
  }

  showActionButtons(): void {
    this.actionBar.style.display = 'flex';
  }

  // ==================== CHAT ====================

  toggleChat(): void {
    const visible = this.chatPanel.style.display === 'flex';
    this.chatPanel.style.display = visible ? 'none' : 'flex';
  }

  showChat(): void {
    this.chatPanel.style.display = 'flex';
    this.chatToggle.style.display = 'none';
  }

  hideChat(): void {
    this.chatPanel.style.display = 'none';
    this.chatToggle.style.display = 'flex';
  }

  addChatMessage(sender: string, message: string): void {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg';
    msgDiv.innerHTML = `<span class="sender">${sender}:</span> ${message}`;
    this.chatMessages.appendChild(msgDiv);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  getChatInput(): string {
    return (document.getElementById('chat-input') as HTMLInputElement).value;
  }

  setChatInput(value: string): void {
    (document.getElementById('chat-input') as HTMLInputElement).value = value;
  }

  // ==================== WAITING / GAME OVER ====================

  showWaiting(roomCode: string): void {
    this.waitingScreen.style.display = 'flex';
    this.roomCodeDisplay.textContent = roomCode;
  }

  hideWaiting(): void {
    this.waitingScreen.style.display = 'none';
  }

  showGameOver(winner: string): void {
    this.gameOverScreen.style.display = 'flex';
    this.gameOverMessage.textContent = `¡Ganó ${winner}!`;
  }

  hideGameOver(): void {
    this.gameOverScreen.style.display = 'none';
  }

  // ==================== HELPERS ====================

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
