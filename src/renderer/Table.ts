// Table - 3D game table with felt surface

import * as THREE from 'three';
import { Card3D } from './Card3D.js';

export class Table {
  private scene: THREE.Scene;
  private tableMesh: THREE.Mesh;
  private cards: Card3D[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.createTable();
    this.createLighting();
  }

  private createTable(): void {
    // Table surface (green felt)
    const tableGeometry = new THREE.PlaneGeometry(14, 9);
    const tableMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a5c1a,    // dark green felt
      roughness: 0.9,
      metalness: 0.0,
    });

    this.tableMesh = new THREE.Mesh(tableGeometry, tableMaterial);
    this.tableMesh.rotation.x = -Math.PI / 2; // Lay flat
    this.tableMesh.position.y = -0.5;
    this.scene.add(this.tableMesh);

    // Table border (wood)
    const borderGeometry = new THREE.BoxGeometry(15, 0.3, 10);
    const borderMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c3a1e,   // dark wood
      roughness: 0.7,
      metalness: 0.1,
    });

    const border = new THREE.Mesh(borderGeometry, borderMaterial);
    border.position.y = -0.65;
    this.scene.add(border);

    // Table edge highlights
    const edgeGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(15, 0.3, 10));
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x8b6914 });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edges.position.y = -0.65;
    this.scene.add(edges);
  }

  private createLighting(): void {
    // Ambient light (soft overall illumination)
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    // Main overhead light (simulates ceiling lamp)
    const mainLight = new THREE.PointLight(0xfff5e0, 1.5, 30);
    mainLight.position.set(0, 8, 0);
    mainLight.castShadow = true;
    this.scene.add(mainLight);

    // Fill light from side
    const fillLight = new THREE.PointLight(0xe0e8ff, 0.5, 20);
    fillLight.position.set(-6, 4, 3);
    this.scene.add(fillLight);

    // Rim light from behind
    const rimLight = new THREE.PointLight(0xffe0c0, 0.3, 20);
    rimLight.position.set(0, 4, -5);
    this.scene.add(rimLight);
  }

  /** Place a card on the table */
  placeCard(card3D: Card3D, x: number, y: number): void {
    card3D.setPosition(x, y);
    card3D.flipBack(); // Cards start face down on table
    card3D.addToScene(this.scene);
    this.cards.push(card3D);
  }

  /** Place a card in the center (played card) */
  playCard(card3D: Card3D, x: number, y: number): void {
    card3D.setPosition(x, y);
    card3D.flip(); // Show face when played
    card3D.setRotation(0, 0, 0);
    card3D.addToScene(this.scene);
    this.cards.push(card3D);
  }

  /** Clear all cards from the table */
  clearCards(): void {
    for (const card of this.cards) {
      card.removeFromScene(this.scene);
      card.dispose();
    }
    this.cards = [];
  }

  /** Get the center position of the table */
  getCenter(): { x: number; y: number } {
    return { x: 0, y: -0.5 };
  }

  /** Get positions for player hands */
  getHandPositions(playerIndex: number, totalPlayers: number): { x: number; y: number }[] {
    const positions: { x: number; y: number }[] = [];

    switch (totalPlayers) {
      case 2:
        // Bottom player (human), top player (AI/opponent)
        if (playerIndex === 0) {
          // Bottom - human player's hand
          positions.push({ x: -2.5, y: -3.5 });
          positions.push({ x: 0, y: -3.8 });
          positions.push({ x: 2.5, y: -3.5 });
        } else {
          // Top - opponent's hand (face down)
          positions.push({ x: -2, y: 3.5 });
          positions.push({ x: 0, y: 3.8 });
          positions.push({ x: 2, y: 3.5 });
        }
        break;

      case 4:
        // Teams: bottom (team 0), right (team 1), top (team 0), left (team 1)
        if (playerIndex === 0) {
          // Bottom - human player
          positions.push({ x: -2.5, y: -3.5 });
          positions.push({ x: 0, y: -3.8 });
          positions.push({ x: 2.5, y: -3.5 });
        } else if (playerIndex === 1) {
          // Right - teammate
          positions.push({ x: 5.5, y: -1 });
          positions.push({ x: 5.8, y: 0 });
          positions.push({ x: 5.5, y: 1 });
        } else if (playerIndex === 2) {
          // Top - opponent
          positions.push({ x: -2, y: 3.5 });
          positions.push({ x: 0, y: 3.8 });
          positions.push({ x: 2, y: 3.5 });
        } else {
          // Left - opponent teammate
          positions.push({ x: -5.5, y: -1 });
          positions.push({ x: -5.8, y: 0 });
          positions.push({ x: -5.5, y: 1 });
        }
        break;

      case 6:
        // Three teams of 2, arranged in a triangle
        if (playerIndex === 0) {
          // Bottom center - human player
          positions.push({ x: -2.5, y: -3.8 });
          positions.push({ x: 0, y: -4.1 });
          positions.push({ x: 2.5, y: -3.8 });
        } else if (playerIndex === 1) {
          // Bottom right - teammate
          positions.push({ x: 4.5, y: -2.5 });
          positions.push({ x: 5, y: -1.8 });
          positions.push({ x: 4.5, y: -1.1 });
        } else if (playerIndex === 2) {
          // Top right - opponent
          positions.push({ x: 3, y: 3.5 });
          positions.push({ x: 0, y: 4 });
          positions.push({ x: -3, y: 3.5 });
        } else if (playerIndex === 3) {
          // Top left - opponent teammate
          positions.push({ x: -4.5, y: 2.5 });
          positions.push({ x: -5, y: 1.8 });
          positions.push({ x: -4.5, y: 1.1 });
        } else if (playerIndex === 4) {
          // Left - opponent
          positions.push({ x: -5.5, y: -0.5 });
          positions.push({ x: -5.8, y: 0 });
          positions.push({ x: -5.5, y: 0.5 });
        } else {
          // Right - teammate
          positions.push({ x: 5.5, y: -0.5 });
          positions.push({ x: 5.8, y: 0 });
          positions.push({ x: 5.5, y: 0.5 });
        }
        break;
    }

    return positions;
  }

  /** Get center play area positions */
  getPlayAreaPositions(totalPlayers: number): { x: number; y: number }[] {
    const positions: { x: number; y: number }[] = [];

    // Arrange played cards in a circle/arc in the center
    const radius = 1.5;
    for (let i = 0; i < totalPlayers; i++) {
      const angle = (i / totalPlayers) * Math.PI * 2 - Math.PI / 2;
      positions.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius - 0.5,
      });
    }

    return positions;
  }
}
