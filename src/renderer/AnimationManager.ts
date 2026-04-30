// AnimationManager - handles card animations

import * as THREE from 'three';
import { Card3D } from './Card3D.js';

export interface AnimationConfig {
  duration: number;       // ms
  fromPos?: THREE.Vector3;
  toPos?: THREE.Vector3;
  fromRot?: THREE.Euler;
  toRot?: THREE.Euler;
  onComplete?: () => void;
}

export class AnimationManager {
  private animations: Animation[] = [];

  constructor() {}

  /** Animate a card's position */
  animatePosition(card: Card3D, config: AnimationConfig): void {
    const anim = new Animation(config.duration);

    const fromPos = config.fromPos || card.group.position.clone();
    const toPos = config.toPos || new THREE.Vector3();

    anim.onUpdate = (t: number) => {
      card.group.position.lerpVectors(fromPos, toPos, t);
    };

    anim.onComplete = config.onComplete;
    this.animations.push(anim);
  }

  /** Animate a card flip */
  animateFlip(card: Card3D, showFace: boolean, duration: number = 400): void {
    const anim = new Animation(duration);

    const startRotY = showFace ? 0 : Math.PI;
    const endRotY = showFace ? Math.PI : 0;

    anim.onUpdate = (t: number) => {
      // Ease in-out
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      card.group.rotation.y = startRotY + (endRotY - startRotY) * eased;
    };

    anim.onComplete = () => {
      if (showFace) card.flip();
      else card.flipBack();
    };

    this.animations.push(anim);
  }

  /** Animate card deal (from deck to hand position) */
  animateDeal(card: Card3D, fromPos: THREE.Vector3, toPos: THREE.Vector3, duration: number = 600): void {
    const anim = new Animation(duration);

    // Arc trajectory
    const midPoint = fromPos.clone().add(toPos).multiplyScalar(0.5);
    midPoint.y += 2; // Arc upward

    let startTime: number | null = null;

    anim.onUpdate = (t: number) => {
      if (!startTime) startTime = performance.now();

      // Quadratic bezier for arc
      const oneMinusT = 1 - t;
      card.group.position.set(
        oneMinusT * oneMinusT * fromPos.x + 2 * oneMinusT * t * midPoint.x + t * t * toPos.x,
        oneMinusT * oneMinusT * fromPos.y + 2 * oneMinusT * t * midPoint.y + t * t * toPos.y,
        oneMinusT * oneMinusT * fromPos.z + 2 * oneMinusT * t * midPoint.z + t * t * toPos.z
      );

      // Rotate during deal
      card.group.rotation.y = t * Math.PI;
    };

    anim.onComplete = () => {
      card.group.rotation.y = 0;
    };

    this.animations.push(anim);
  }

  /** Animate card play (from hand to center) */
  animatePlay(card: Card3D, fromPos: THREE.Vector3, toPos: THREE.Vector3, duration: number = 500): void {
    const anim = new Animation(duration);

    anim.onUpdate = (t: number) => {
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      card.group.position.lerpVectors(fromPos, toPos, eased);

      // Slight rotation during play
      card.group.rotation.z = Math.sin(t * Math.PI) * 0.1;
    };

    anim.onComplete = () => {
      card.group.rotation.z = 0;
    };

    this.animations.push(anim);
  }

  /** Animate score popup */
  animateScorePopup(text: string, position: THREE.Vector3, scene: THREE.Scene): void {
    // Create a simple sprite for the score popup
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.roundRect(20, 10, 216, 108, 16);
    ctx.fill();

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 75);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMaterial);

    sprite.position.copy(position);
    sprite.position.y += 1;
    sprite.scale.set(2, 1, 1);

    scene.add(sprite);

    // Animate fade out and move up
    const anim = new Animation(1500);
    let startTime: number | null = null;

    anim.onUpdate = (t: number) => {
      if (!startTime) startTime = performance.now();

      sprite.position.y += 0.01;
      spriteMaterial.opacity = 1 - t;

      // Scale pulse
      const scale = 1 + Math.sin(t * Math.PI) * 0.2;
      sprite.scale.set(2 * scale, 1 * scale, 1);
    };

    anim.onComplete = () => {
      scene.remove(sprite);
      texture.dispose();
      spriteMaterial.dispose();
    };

    this.animations.push(anim);
  }

  /** Update all animations (call each frame) */
  update(deltaTime: number): void {
    for (let i = this.animations.length - 1; i >= 0; i--) {
      const anim = this.animations[i];
      anim.update(deltaTime);

      if (anim.isComplete()) {
        this.animations.splice(i, 1);
      }
    }
  }

  /** Clear all animations */
  clear(): void {
    this.animations = [];
  }
}

/** Simple animation class */
class Animation {
  private startTime: number = 0;
  private duration: number;
  public onUpdate?: (t: number) => void; // t: 0 to 1
  public onComplete?: () => void;
  private _complete: boolean = false;

  constructor(duration: number) {
    this.duration = duration;
    this.startTime = performance.now();
  }

  update(deltaTime: number): void {
    if (this._complete) return;

    const elapsed = performance.now() - this.startTime + deltaTime;
    let t = Math.min(elapsed / this.duration, 1);

    if (this.onUpdate) {
      this.onUpdate(t);
    }

    if (t >= 1) {
      this._complete = true;
      if (this.onComplete) this.onComplete();
    }
  }

  isComplete(): boolean {
    return this._complete;
  }
}
