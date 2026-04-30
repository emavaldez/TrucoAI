// UIManager - User interface management for Truco

export class UIManager {
  private container: HTMLElement;
  
  constructor(containerId = 'game-container') {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container #${containerId} not found`);
    this.container = container;
  }
  
  /**
   * Show main menu
   */
  showMenu(): void {
    this.clearContainer();
    
    const menuHTML = `
      <div class="menu-container">
        <h1>TRUCO AI</h1>
        
        <div class="mode-select">
          <p>Seleccioná el modo de juego:</p>
          <div class="mode-buttons">
            <button data-mode="solo" class="btn-mode selected">Solo (vs IA)</button>
            <button data-mode="multiplayer" class="btn-mode">Multijugador (Online)</button>
          </div>
        </div>
        
        <div class="player-count-select">
          <p>Cantidad de jugadores:</p>
          <div class="count-buttons">
            <button data-players="2" class="btn-count selected">2</button>
            <button data-players="4" class="btn-count">4</button>
            <button data-players="6" class="btn-count">6</button>
          </div>
        </div>
        
        <div class="difficulty-select">
          <p>Dificultad de la IA:</p>
          <div class="difficulty-buttons">
            <button data-diff="easy" class="btn-diff">Fácil</button>
            <button data-diff="normal" class="btn-diff selected">Normal</button>
            <button data-diff="hard" class="btn-diff">Difícil</button>
          </div>
        </div>
        
        <button id="start-btn" class="btn-start">¡JUGAR!</button>
      </div>
    `;
    
    this.container.innerHTML = menuHTML;
    
    // Setup button selection
    this.container.querySelectorAll('.btn-mode').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
    this.container.querySelectorAll('.btn-count').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.btn-count').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
    this.container.querySelectorAll('.btn-diff').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.btn-diff').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }
  
  /**
   * Show HUD during game
   */
  showHUD(): void {
    // Remove any menu/waiting/game-over overlays that might exist
    const overlays = this.container.querySelectorAll('.menu-container, .waiting-container, .game-over-container');
    overlays.forEach(el => el.remove());
    
    // Only add HUD elements if they don't already exist
    if (!document.getElementById('scoreboard')) {
      const hudHTML = `
        <div class="hud-container">
          <div class="scoreboard" id="scoreboard"></div>
          
          <div class="game-area" id="game-area">
            <!-- 3D game canvas will be here -->
          </div>
          
          <div class="controls" id="controls">
            <button class="btn-envido" id="btn-envido">ENVIDO</button>
            <button class="btn-truco" id="btn-truco">TRUCO</button>
            <button class="btn-mazo" id="btn-mazo" style="background: #8b0000; color: white;">MAZO</button>
          </div>
          
          <div class="message-area" id="message-area"></div>
        </div>
      `;
      
      this.container.insertAdjacentHTML('afterbegin', hudHTML);
    }
  }
  
  /**
   * Show waiting screen for multiplayer
   */
  showWaiting(roomCode: string): void {
    this.clearContainer();
    
    const waitingHTML = `
      <div class="waiting-container">
        <h2>Esperando jugadores...</h2>
        <p>Código de sala: ${roomCode}</p>
      </div>
    `;
    
    this.container.innerHTML = waitingHTML;
  }
  
  /**
   * Show game over screen
   */
  showGameOver(winnerId: string): void {
    this.clearContainer();
    
    const gameOverHTML = `
      <div class="game-over-container">
        <h1>¡JUEGO TERMINADO!</h1>
        <p class="winner">El ganador es: ${winnerId}</p>
      </div>
    `;
    
    this.container.innerHTML = gameOverHTML;
  }
  
  /**
   * Render card hand display
   */
  renderCardHand(cards: { number: number; suit: string }[], showFace = true): void {
    const gameArea = document.getElementById('game-area');
    if (!gameArea) return;
    
    let handHTML = '<div class="card-hand">';
    
    cards.forEach((card, index) => {
      handHTML += `
        <div class="card ${showFace ? '' : 'back'}" data-index="${index}">
          ${showFace ? this.getCardFaceHTML(card.number, card.suit) : ''}
        </div>
      `;
    });
    
    handHTML += '</div>';
    gameArea.innerHTML = handHTML;
    
    // Add click handlers to cards
    if (showFace) {
      setTimeout(() => {
        const cardElements = gameArea.querySelectorAll('.card');
        cardElements.forEach((el) => {
          el.addEventListener('click', () => {
            const index = parseInt(el.getAttribute('data-index') || '-1');
            if ((window as any).trucoApp?.handlePlayerCardClick) {
              (window as any).trucoApp.handlePlayerCardClick(index);
            }
          });
        });
      }, 100);
    }
  }
  
  /**
   * Get HTML for card face
   */
  private getCardFaceHTML(number: number, suit: string): string {
    const suits: Record<string, string> = {
      espada: '⚔',
      basto: '🌿',
      oro: '☀',
      copa: '🏆',
    };
    
    const suitColors: Record<string, string> = {
      espada: '#2c3e50',
      basto: '#2d5016',
      oro: '#b8860b',
      copa: '#1a3a5c',
    };
    
    const suitSymbol = suits[suit] ?? '?';
    const suitColor = suitColors[suit] ?? '#333';
    
    return `
      <div class="card-content">
        <span class="top-left">${number} ${suitSymbol}</span>
        <div class="center-suit" style="color: ${suitColor}; font-size: 60px;">${suitSymbol}</div>
      </div>
    `;
  }
  
  /**
   * Update score display
   */
  updateScores(scores: Record<string, number>): void {
    const scoreboard = document.getElementById('scoreboard');
    if (!scoreboard) return;
    
    let scoreHTML = '<div class="scores">';
    
    for (const [player, points] of Object.entries(scores)) {
      scoreHTML += `
        <div class="player-score">
          <span class="player-name">${player}</span>
          <span class="score-value">${points}</span>
        </div>
      `;
    }
    
    scoreHTML += '</div>';
    scoreboard.innerHTML = scoreHTML;
  }
  
  /**
   * Show temporary message
   */
  showMessage(text: string, duration = 2000): void {
    let messageArea = document.getElementById('message-area');
    
    if (!messageArea) {
      messageArea = document.createElement('div');
      messageArea.id = 'message-area';
      this.container.appendChild(messageArea);
    }
    
    messageArea.innerHTML = `<p>${text}</p>`;
    
    setTimeout(() => {
      if (messageArea) messageArea.innerHTML = '';
    }, duration);
  }
  
  /**
   * Clear overlay elements (menu, HUD, game-over) without destroying the canvas
   */
  private clearContainer(): void {
    const overlays = this.container.querySelectorAll('.menu-container, .waiting-container, .game-over-container, .hud-container');
    overlays.forEach(el => el.remove());
  }
  
  /**
   * Bind HUD button events
   */
  bindHUDButtons(onEnvido: () => void, onTruco: () => void, onMazo: () => void): void {
    const envidoBtn = document.getElementById('btn-envido');
    const trucoBtn = document.getElementById('btn-truco');
    const mazoBtn = document.getElementById('btn-mazo');
    
    if (envidoBtn) envidoBtn.addEventListener('click', onEnvido);
    if (trucoBtn) trucoBtn.addEventListener('click', onTruco);
    if (mazoBtn) mazoBtn.addEventListener('click', onMazo);
  }
}

