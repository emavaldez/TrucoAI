// Scene - Main Three.js scene setup and management

import * as THREE from 'three';
import { Table } from './Table.js';
import { Card3D } from './Card3D.js';
import { AnimationManager } from './AnimationManager.js';

export class Scene {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private scene: THREE.Scene;
  private table: Table;
  private animationManager: AnimationManager;

  // Card pools for reuse
  private cardPool: Card3D[] = [];

  constructor(container: HTMLElement) {
    // Scene
    this.scene = new THREE.Scene();

    // Camera - perspective, looking down at the table
    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 8, 6); // Above and slightly in front
    this.camera.lookAt(0, -0.5, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x1a0a00); // Dark brown background

    container.appendChild(this.renderer.domElement);

    // Table
    this.table = new Table(this.scene);

    // Animation manager
    this.animationManager = new AnimationManager();

    // Handle resize
    window.addEventListener('resize', () => this.onResize());

    // Start render loop
    this.animate();
  }

  get scene(): THREE.Scene { return this.scene; }
  get camera(): THREE.PerspectiveCamera { return this.camera; }
  get renderer(): THREE.WebGLRenderer { return this.renderer; }
  get table(): Table { return this.table; }
  get animationManager(): AnimationManager { return this.animationManager; }

  /** Get a card from the pool or create a new one */
  getCard(): Card3D {
    let card = this.cardPool.pop();
    if (!card) {
      card = new Card3D();
      card.generateBackTexture();
    }
    return card;
  }

  /** Return a card to the pool */
  releaseCard(card: Card3D): void {
    this.cardPool.push(card);
  }

  /** Clear all cards from the scene */
  clearCards(): void {
    this.table.clearCards();
    // Return all cards to pool
    while (this.cardPool.length > 0) {
      const card = this.cardPool.pop();
      if (card) card.dispose();
    }
  }

  /** Set camera position for different player views */
  setCameraView(view: 'bottom' | 'top' | 'left' | 'right'): void {
    switch (view) {
      case 'bottom':
        this.camera.position.set(0, 8, 6);
        break;
      case 'top':
        this.camera.position.set(0, 8, -6);
        break;
      case 'left':
        this.camera.position.set(-8, 6, 0);
        break;
      case 'right':
        this.camera.position.set(8, 6, 0);
        break;
    }
    this.camera.lookAt(0, -0.5, 0);
  }

  /** Rotate camera around the table (for multiplayer) */
  rotateCamera(angle: number): void {
    const radius = 8;
    this.camera.position.x = Math.sin(angle) * radius;
    this.camera.position.z = Math.cos(angle) * radius;
    this.camera.position.y = 6;
    this.camera.lookAt(0, -0.5, 0);
  }

  /** Handle window resize */
  private onResize(): void {
    const container = this.renderer.domElement.parentElement;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /** Main render loop */
  private animate(): void {
    requestAnimationFrame(() => this.animate());

    const deltaTime = 16; // ~60fps
    this.animationManager.update(deltaTime);

    this.renderer.render(this.scene, this.camera);
  }

  /** Dispose of all resources */
  dispose(): void {
    this.clearCards();
    window.removeEventListener('resize', () => this.onResize());

    // Dispose renderer
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
