// Scene - Three.js scene manager for the Truco game

import * as THREE from 'three';
import type { Card } from '../core/Card.js';
import { Card3D } from './Card3D.js';
import { Table } from './Table.js';

/**
 * Main 3D scene manager
 */
export class Scene {
  private readonly container: HTMLElement;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly table: Table;
  private playerCards: Card3D[] = [];
  private aiCards: Card3D[] = [];
  private playedCards: { player: Card3D | null; ai: Card3D | null } = { player: null, ai: null };
  private animationFrameId: number | null = null;
  private clock = new THREE.Clock();

  // Raycasting
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private onCardClickCallback: ((cardIndex: number) => void) | null = null;

  // Camera
  private cameraAngle = 0;
  private cameraDistance = 12;
  private cameraHeight = 6;
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Layout constants
  private readonly PLAYER_HAND_Y = 2.5;
  private readonly AI_HAND_Y = -2.5;
  private readonly CARD_SPACING = 1.6;

  constructor(container: HTMLElement) {
    this.container = container;

    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a1a);
    this.scene.fog = new THREE.FogExp2(0x0a0a1a, 0.015);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    this.updateCameraPosition();

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    // Create table
    this.table = new Table();
    this.table.addToScene(this.scene);

    // Setup event listeners
    this.setupEvents();

    // Start render loop
    this.animate();
  }

  /**
   * Update camera position based on angle and distance
   */
  private updateCameraPosition(): void {
    this.camera.position.x = Math.sin(this.cameraAngle) * this.cameraDistance;
    this.camera.position.z = Math.cos(this.cameraAngle) * this.cameraDistance;
    this.camera.position.y = this.cameraHeight;
    this.camera.lookAt(0, 0, -1);
  }

  /**
   * Setup mouse/touch event listeners for camera control
   */
  private setupEvents(): void {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    canvas.addEventListener('mouseup', (e) => {
      // If the mouse didn't move much, treat it as a click (not a drag)
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5 && this.playerCards.length > 0) {
        this.handleCardClick(e);
      }
      this.isDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.cameraAngle += dx * 0.005;
      this.cameraHeight = Math.max(3, Math.min(15, this.cameraHeight - dy * 0.03));
      this.updateCameraPosition();
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDistance = Math.max(6, Math.min(25, this.cameraDistance + e.deltaY * 0.01));
      this.updateCameraPosition();
    }, { passive: false });

    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.lastMouseX = e.touches[0].clientX;
        this.lastMouseY = e.touches[0].clientY;
      }
    });

    canvas.addEventListener('touchmove', (e) => {
      if (!this.isDragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - this.lastMouseX;
      const dy = e.touches[0].clientY - this.lastMouseY;
      this.cameraAngle += dx * 0.005;
      this.cameraHeight = Math.max(3, Math.min(15, this.cameraHeight - dy * 0.03));
      this.updateCameraPosition();
      this.lastMouseX = e.touches[0].clientX;
      this.lastMouseY = e.touches[0].clientY;
    });

    canvas.addEventListener('touchend', () => {
      this.isDragging = false;
    });

    window.addEventListener('resize', () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });
  }

  /**
   * Set the callback for when a player card is clicked
   */
  setCardClickCallback(callback: (cardIndex: number) => void): void {
    this.onCardClickCallback = callback;
  }

  /**
   * Handle click on player cards using raycasting
   */
  private handleCardClick(event: MouseEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Collect all meshes from player cards
    const meshes: THREE.Object3D[] = [];
    this.playerCards.forEach((card) => {
      card.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          meshes.push(child);
        }
      });
    });

    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      // Find which card was clicked
      const hitObject = intersects[0].object;
      let clickedCardIndex = -1;

      for (let i = 0; i < this.playerCards.length; i++) {
        let found = false;
        this.playerCards[i].group.traverse((child) => {
          if (child === hitObject) found = true;
        });
        if (found) {
          clickedCardIndex = i;
          break;
        }
      }

      if (clickedCardIndex >= 0) {
        // Highlight the card
        this.highlightCard(clickedCardIndex, true);
        this.selectCard(clickedCardIndex);
        // Call the callback
        if (this.onCardClickCallback) {
          this.onCardClickCallback(clickedCardIndex);
        }
      }
    }
  }

  /**
   * Create a Card3D from a Card definition
   */
  createCard3D(card: Card, faceUp: boolean = false): Card3D {
    return new Card3D(card, faceUp);
  }

  /**
   * Deal cards to player's hand (face up, clickable)
   */
  dealPlayerHand(cards: Card[]): void {
    this.clearPlayerHand();

    const startX = -((cards.length - 1) * this.CARD_SPACING) / 2;

    // Debug: Add a bright red cube at center of player hand to verify visibility
    const debugGeo = new THREE.BoxGeometry(4, 0.5, 0.3);
    const debugMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
    const debugMesh = new THREE.Mesh(debugGeo, debugMat);
    debugMesh.position.set(0, this.PLAYER_HAND_Y, -1);
    this.scene.add(debugMesh);

    // Debug 2: Add a bright green cube right in front of camera
    const debug2Geo = new THREE.BoxGeometry(2, 2, 0.1);
    const debug2Mat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const debug2Mesh = new THREE.Mesh(debug2Geo, debug2Mat);
    debug2Mesh.position.set(0, 2, 4);
    this.scene.add(debug2Mesh);

    cards.forEach((card, index) => {
      const card3D = new Card3D(card, true);
      const x = startX + index * this.CARD_SPACING;
      card3D.setPosition(x, this.PLAYER_HAND_Y, -1);
      card3D.setScale(0.9);
      card3D.addToScene(this.scene);
      this.playerCards.push(card3D);
    });
  }

  /**
   * Deal cards to AI's hand (face down)
   */
  dealAIHand(cards: Card[]): void {
    this.clearAIHand();

    const startX = -((cards.length - 1) * this.CARD_SPACING) / 2;

    cards.forEach((card, index) => {
      const card3D = new Card3D(card, false);
      const x = startX + index * this.CARD_SPACING;
      card3D.setPosition(x, this.AI_HAND_Y, 1);
      card3D.setScale(0.9);
      card3D.addToScene(this.scene);
      this.aiCards.push(card3D);
    });
  }

  /**
   * Play a card to the center zone (player)
   */
  playPlayerCard(card: Card, animate: boolean = true): Card3D | null {
    if (this.playedCards.player) {
      this.playedCards.player.removeFromScene(this.scene);
    }

    const card3D = new Card3D(card, true);
    const targetX = -1;
    const targetZ = 0;

    if (animate) {
      const sourceCard = this.playerCards.find(c => c.group.position.x < 0);
      if (sourceCard) {
        card3D.setPosition(
          sourceCard.group.position.x,
          this.PLAYER_HAND_Y,
          -1
        );
        card3D.addToScene(this.scene);
        card3D.animateTo(targetX, 0.5, targetZ, 0, 0, 600);
      } else {
        card3D.setPosition(targetX, 0.5, targetZ);
        card3D.addToScene(this.scene);
      }
    } else {
      card3D.setPosition(targetX, 0.5, targetZ);
      card3D.addToScene(this.scene);
    }

    this.playedCards.player = card3D;
    return card3D;
  }

  /**
   * Play a card to the center zone (AI)
   */
  playAICard(card: Card, animate: boolean = true): Card3D | null {
    if (this.playedCards.ai) {
      this.playedCards.ai.removeFromScene(this.scene);
    }

    const card3D = new Card3D(card, true);
    const targetX = 1;
    const targetZ = 0;

    if (animate) {
      const sourceCard = this.aiCards.find(c => c.group.position.x < 0);
      if (sourceCard) {
        card3D.setPosition(
          sourceCard.group.position.x,
          this.AI_HAND_Y,
          1
        );
        card3D.addToScene(this.scene);
        card3D.animateTo(targetX, 0.5, targetZ, 0, 0, 600);
      } else {
        card3D.setPosition(targetX, 0.5, targetZ);
        card3D.addToScene(this.scene);
      }
    } else {
      card3D.setPosition(targetX, 0.5, targetZ);
      card3D.addToScene(this.scene);
    }

    this.playedCards.ai = card3D;
    return card3D;
  }

  /**
   * Clear played cards from the table
   */
  clearPlayedCards(): void {
    if (this.playedCards.player) {
      this.playedCards.player.removeFromScene(this.scene);
      this.playedCards.player = null;
    }
    if (this.playedCards.ai) {
      this.playedCards.ai.removeFromScene(this.scene);
      this.playedCards.ai = null;
    }
  }

  /**
   * Highlight a player's card (hover/select effect)
   */
  highlightCard(index: number, active: boolean): void {
    if (index >= 0 && index < this.playerCards.length) {
      this.playerCards[index].highlight(active);
    }
  }

  /**
   * Show a card being selected (slight bounce animation)
   */
  selectCard(index: number): void {
    if (index < 0 || index >= this.playerCards.length) return;
    const card = this.playerCards[index];
    const startY = card.group.position.y;
    const startTime = performance.now();
    const duration = 200;

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / duration, 1);
      const bounce = Math.sin(t * Math.PI) * 0.3;
      card.group.position.y = startY + bounce;
      if (t < 1) requestAnimationFrame(animate);
      else card.group.position.y = startY;
    };

    requestAnimationFrame(animate);
  }

  /**
   * Clear player hand from scene
   */
  clearPlayerHand(): void {
    for (const card of this.playerCards) {
      card.removeFromScene(this.scene);
    }
    this.playerCards = [];
  }

  /**
   * Clear AI hand from scene
   */
  clearAIHand(): void {
    for (const card of this.aiCards) {
      card.removeFromScene(this.scene);
    }
    this.aiCards = [];
  }

  /**
   * Clear all cards
   */
  clearAll(): void {
    this.clearPlayerHand();
    this.clearAIHand();
    this.clearPlayedCards();
    this.table.removeHighlight();
  }

  /**
   * Animate a card flying from one position to another
   */
  animateCardFly(
    fromX: number, fromY: number, fromZ: number,
    toX: number, toY: number, toZ: number,
    card: Card3D,
    duration: number = 800
  ): void {
    card.setPosition(fromX, fromY, fromZ);
    card.addToScene(this.scene);

    const startTime = performance.now();
    const animate = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      card.group.position.x = fromX + (toX - fromX) * ease;
      card.group.position.y = fromY + (toY - fromY) * ease + Math.sin(t * Math.PI) * 2;
      card.group.position.z = fromZ + (toZ - fromZ) * ease;
      card.group.rotation.y = t * Math.PI * 2;

      if (t < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Show a message floating above the table
   */
  showMessage(text: string, color: number = 0xffffff): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    roundRect(ctx, 0, 0, 512, 128, 20);
    ctx.fill();

    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(0, 3, 0);
    sprite.scale.set(6, 1.5, 1);
    this.scene.add(sprite);

    // Animate fade out
    const startTime = performance.now();
    const duration = 2000;
    const animate = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / duration, 1);
      sprite.material.opacity = 1 - t;
      sprite.position.y = 3 + t * 1;

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        this.scene.remove(sprite);
        texture.dispose();
        spriteMat.dispose();
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Main animation loop
   */
  private animate(): void {
    this.animationFrameId = requestAnimationFrame(() => this.animate());

    const elapsed = this.clock.getElapsedTime();

    // Subtle idle animation for AI cards (gentle float)
    this.aiCards.forEach((card, i) => {
      card.group.position.y = this.AI_HAND_Y + Math.sin(elapsed * 1.5 + i * 0.5) * 0.05;
    });

    // Subtle idle animation for player cards
    this.playerCards.forEach((card, i) => {
      card.group.position.y = this.PLAYER_HAND_Y + Math.sin(elapsed * 1.2 + i * 0.7) * 0.03;
    });

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Get the Three.js renderer element
   */
  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /**
   * Get the Three.js scene
   */
  get sceneRef(): THREE.Scene {
    return this.scene;
  }

  /**
   * Get the Three.js camera
   */
  get cameraRef(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.clearAll();
    this.table.removeFromScene(this.scene);
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

/**
 * Helper: draw rounded rectangle on canvas
 */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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
