// Card3D - 3D card model with procedural canvas textures

import * as THREE from 'three';
import type { Card } from '../core/Card.js';

const CARD_WIDTH = 1.2;
const CARD_HEIGHT = 1.7;
const CARD_DEPTH = 0.02;

export class Card3D {
  private group: THREE.Group;
  private cardMesh: THREE.Mesh;
  private backMaterial: THREE.Material;
  private frontMaterial: THREE.Material;
  private cardData: Card | null = null;
  private isFlipped: boolean = true; // face down by default

  constructor() {
    this.group = new THREE.Group();

    // Card geometry (thin box)
    const geometry = new THREE.BoxGeometry(CARD_WIDTH, CARD_HEIGHT, CARD_DEPTH);

    // Front material (with card face texture)
    this.frontMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.1,
    });

    // Back material (pattern)
    this.backMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b0000,
      roughness: 0.5,
    });

    // Materials array for BoxGeometry: [+x, -x, +y, -y, +z (front), -z (back)]
    const sideMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });

    this.cardMesh = new THREE.Mesh(geometry, [
      sideMaterial,  // right
      sideMaterial,  // left
      sideMaterial,  // top
      sideMaterial,  // bottom
      this.frontMaterial,  // front
      this.backMaterial,   // back
    ]);

    this.group.add(this.cardMesh);
  }

  get group(): THREE.Group {
    return this.group;
  }

  /** Set the card data and generate front texture */
  setCard(card: Card): void {
    this.cardData = card;
    this.generateFrontTexture(card);
  }

  /** Generate a canvas texture for the card face */
  private generateFrontTexture(card: Card): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 360;
    const ctx = canvas.getContext('2d')!;

    // White background with rounded corners
    ctx.fillStyle = '#ffffff';
    this.roundRect(ctx, 0, 0, 256, 360, 16);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    this.roundRect(ctx, 4, 4, 248, 352, 14);
    ctx.stroke();

    // Card number and suit
    const suitSymbols: Record<string, string> = {
      espada: '⚔',   // sword
      basto: '🌿',   // club/basto
      oro: '☀',      // sun/gold
      copa: '🏆',     // cup
    };

    const suitColors: Record<string, string> = {
      espada: '#2c3e50',  // dark blue-gray for swords
      basto: '#2d5016',   // green for clubs
      oro: '#b8860b',     // dark goldenrod
      copa: '#1a3a5c',    // dark blue for cups
    };

    const suitColor = suitColors[card.suit] || '#333';
    const numberStr = card.number.toString();

    // Top-left corner: small number + suit
    ctx.fillStyle = suitColor;
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(numberStr, 16, 42);
    ctx.font = '28px Arial';
    ctx.fillText(suitSymbols[card.suit] || '?', 16, 72);

    // Center: large suit symbol
    ctx.font = '80px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = suitColor;
    ctx.fillText(suitSymbols[card.suit] || '?', 128, 200);

    // Center: large number
    ctx.font = 'bold 64px Arial';
    ctx.fillText(numberStr, 128, 270);

    // Bottom-right corner: rotated number + suit
    ctx.save();
    ctx.translate(240, 340);
    ctx.rotate(Math.PI);
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'left';
    ctx.fillStyle = suitColor;
    ctx.fillText(numberStr, 0, 0);
    ctx.font = '28px Arial';
    ctx.fillText(suitSymbols[card.suit] || '?', 0, 30);
    ctx.restore();

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    this.frontMaterial.map = texture;
    this.frontMaterial.needsUpdate = true;
  }

  /** Generate back pattern texture */
  generateBackTexture(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 360;
    const ctx = canvas.getContext('2d')!;

    // Dark red background
    ctx.fillStyle = '#8b0000';
    this.roundRect(ctx, 0, 0, 256, 360, 16);
    ctx.fill();

    // Diamond pattern
    ctx.strokeStyle = '#a52a2a';
    ctx.lineWidth = 2;

    for (let i = -200; i < 500; i += 30) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 180, 360);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(i + 180, 0);
      ctx.lineTo(i, 360);
      ctx.stroke();
    }

    // Gold border
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 4;
    this.roundRect(ctx, 8, 8, 240, 344, 12);
    ctx.stroke();

    // Center emblem
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('TRUCO', 128, 190);

    const texture = new THREE.CanvasTexture(canvas);
    this.backMaterial.map = texture;
    this.backMaterial.needsUpdate = true;
  }

  /** Flip the card to show front */
  flip(): void {
    this.isFlipped = false;
    // Animate the flip (instant for now, can be animated later)
    this.cardMesh.rotation.y = 0;
  }

  /** Flip the card to show back */
  flipBack(): void {
    this.isFlipped = true;
    this.cardMesh.rotation.y = Math.PI;
  }

  /** Position the card */
  setPosition(x: number, y: number, z: number = 0): void {
    this.group.position.set(x, y, z);
  }

  /** Rotate the card */
  setRotation(x: number, y: number, z: number): void {
    this.group.rotation.set(x, y, z);
  }

  /** Scale the card */
  setScale(s: number): void {
    this.group.scale.set(s, s, s);
  }

  /** Add to scene */
  addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  /** Remove from scene */
  removeFromScene(scene: THREE.Scene): void {
    scene.remove(this.group);
  }

  /** Helper: draw rounded rectangle */
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

  dispose(): void {
    this.cardMesh.geometry.dispose();
    (this.frontMaterial as any).map?.dispose();
    this.frontMaterial.dispose();
    (this.backMaterial as any).map?.dispose();
    this.backMaterial.dispose();
  }
}
