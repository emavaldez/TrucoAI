// Card3D - 3D card mesh with face textures using Canvas

import * as THREE from 'three';
import type { Card } from '../core/Card.js';

const CARD_WIDTH = 1.2;
const CARD_HEIGHT = 1.7;
const CARD_DEPTH = 0.02;

const SUIT_SYMBOLS: Record<string, string> = {
  espada: '⚔',
  basto: '🌿',
  oro: '☀',
  copa: '🏆',
};

const SUIT_COLORS: Record<string, string> = {
  espada: '#1a237e',
  basto: '#1b5e20',
  oro: '#b8860b',
  copa: '#0d47a1',
};

const BACK_COLOR = '#1a5c2a';
const BACK_PATTERN = '#145220';

/**
 * Generate a canvas texture for the face of a card
 */
function createFaceTexture(card: Card): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 360;
  const ctx = canvas.getContext('2d')!;

  // White background with rounded corners
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 0, 0, 256, 360, 16);
  ctx.fill();

  // Border
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 3;
  roundRect(ctx, 4, 4, 248, 352, 14);
  ctx.stroke();

  const symbol = SUIT_SYMBOLS[card.suit] ?? '?';
  const color = SUIT_COLORS[card.suit] ?? '#333';

  // Top-left corner
  ctx.fillStyle = color;
  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(`${card.number}`, 14, 14);
  ctx.font = '28px Arial, sans-serif';
  ctx.fillText(symbol, 14, 52);

  // Center large symbol
  ctx.fillStyle = color;
  ctx.font = '80px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, 128, 180);

  // Bottom-right corner (inverted)
  ctx.save();
  ctx.translate(128, 360);
  ctx.rotate(Math.PI);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.fillText(`${card.number}`, -14, 14);
  ctx.font = '28px Arial, sans-serif';
  ctx.fillText(symbol, -14, 52);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Generate a canvas texture for the back of a card
 */
function createBackTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 360;
  const ctx = canvas.getContext('2d')!;

  // Green background
  ctx.fillStyle = BACK_COLOR;
  roundRect(ctx, 0, 0, 256, 360, 16);
  ctx.fill();

  // Border
  ctx.strokeStyle = BACK_PATTERN;
  ctx.lineWidth = 4;
  roundRect(ctx, 8, 8, 240, 344, 12);
  ctx.stroke();

  // Inner pattern - diagonal lines
  ctx.strokeStyle = BACK_PATTERN;
  ctx.lineWidth = 2;
  for (let i = -360; i < 512; i += 20) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 360, 360);
    ctx.stroke();
  }

  // Center ornament
  ctx.fillStyle = BACK_PATTERN;
  ctx.font = 'bold 48px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TRUCO', 128, 180);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Draw a rounded rectangle on canvas context
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

/**
 * 3D Card mesh - a box with front face, back face, and side edges
 */
export class Card3D {
  private readonly mesh: THREE.Group;
  private readonly card: Card;
  private faceUp: boolean = false;

  constructor(card: Card, faceUp: boolean = false) {
    this.card = card;
    this.faceUp = faceUp;
    this.mesh = new THREE.Group();
    this.buildCard();
  }

  /**
   * Build the 3D card geometry
   */
  private buildCard(): void {
    const geometry = new THREE.BoxGeometry(CARD_WIDTH, CARD_HEIGHT, CARD_DEPTH);

    const faceTexture = createFaceTexture(this.card);
    const backTexture = createBackTexture();

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture });
    const backMat = new THREE.MeshStandardMaterial({ map: backTexture });

    // Box face order: +x, -x, +y, -y, +z (front), -z (back)
    const materials = [
      whiteMat,  // right edge
      whiteMat,  // left edge
      whiteMat,  // top edge
      whiteMat,  // bottom edge
      faceMat,   // front face
      backMat,   // back face
    ];

    const cardMesh = new THREE.Mesh(geometry, materials);
    this.mesh.add(cardMesh);

    // Slight shadow
    const shadowGeo = new THREE.PlaneGeometry(CARD_WIDTH * 1.05, CARD_HEIGHT * 1.05);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -CARD_HEIGHT / 2 - 0.01;
    shadow.position.z = -0.005;
    this.mesh.add(shadow);
  }

  get group(): THREE.Group {
    return this.mesh;
  }

  get isFaceUp(): boolean {
    return this.faceUp;
  }

  /**
   * Flip the card to show face or back
   */
  setFaceUp(faceUp: boolean): void {
    this.faceUp = faceUp;
    const targetY = faceUp ? 0 : Math.PI;
    this.mesh.rotation.y = targetY;
  }

  /**
   * Set position
   */
  setPosition(x: number, y: number, z: number): void {
    this.mesh.position.set(x, y, z);
  }

  /**
   * Set rotation (radians)
   */
  setRotation(x: number, y: number, z: number): void {
    this.mesh.rotation.set(x, y, z);
  }

  /**
   * Scale the card
   */
  setScale(s: number): void {
    this.mesh.scale.setScalar(s);
  }

  /**
   * Animate card to a position with easing
   */
  animateTo(
    targetX: number,
    targetY: number,
    targetZ: number,
    targetRX: number,
    targetRY: number,
    duration: number = 500,
    onComplete?: () => void
  ): void {
    const startX = this.mesh.position.x;
    const startY = this.mesh.position.y;
    const startZ = this.mesh.position.z;
    const startRX = this.mesh.rotation.x;
    const startRY = this.mesh.rotation.y;
    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);

      this.mesh.position.x = startX + (targetX - startX) * ease;
      this.mesh.position.y = startY + (targetY - startY) * ease;
      this.mesh.position.z = startZ + (targetZ - startZ) * ease;
      this.mesh.rotation.x = startRX + (targetRX - startRX) * ease;
      this.mesh.rotation.y = startRY + (targetRY - startRY) * ease;

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        onComplete?.();
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Highlight the card (e.g., hover effect)
   */
  highlight(active: boolean): void {
    const scale = active ? 1.08 : 1.0;
    this.mesh.scale.setScalar(scale);
    if (active) {
      this.mesh.position.y += 0.15;
    } else {
      this.mesh.position.y -= 0.15;
    }
  }

  /**
   * Add to a Three.js scene
   */
  addToScene(scene: THREE.Scene): void {
    scene.add(this.mesh);
  }

  /**
   * Remove from a Three.js scene
   */
  removeFromScene(scene: THREE.Scene): void {
    scene.remove(this.mesh);
  }
}
