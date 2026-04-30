// Table - 3D game table and environment

import * as THREE from 'three';

const TABLE_WIDTH = 12;
const TABLE_HEIGHT = 0.15;
const TABLE_LENGTH = 18;
const TABLE_EDGE_HEIGHT = 0.8;
const TABLE_EDGE_THICKNESS = 0.4;

/**
 * 3D game table with felt surface, edges, and background
 */
export class Table {
  private readonly mesh: THREE.Group;
  private highlightMesh: THREE.Mesh | null = null;

  constructor() {
    this.mesh = new THREE.Group();

    // Green felt material
    const feltMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d5c2a,
      roughness: 0.9,
      metalness: 0.0,
    });

    // Dark wood material
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x3e2723,
      roughness: 0.6,
      metalness: 0.1,
    });

    // Table felt surface (horizontal plane)
    const feltGeo = new THREE.BoxGeometry(TABLE_WIDTH, TABLE_HEIGHT, TABLE_LENGTH);
    const felt = new THREE.Mesh(feltGeo, feltMaterial);
    felt.position.y = -TABLE_HEIGHT / 2;
    this.mesh.add(felt);

    // Table edges (raised borders)
    const edgePositions = [
      // Front edge (closest to player)
      { x: 0, z: TABLE_LENGTH / 2 + TABLE_EDGE_THICKNESS / 2 },
      // Back edge (AI side)
      { x: 0, z: -TABLE_LENGTH / 2 - TABLE_EDGE_THICKNESS / 2 },
      // Left edge
      { x: -TABLE_WIDTH / 2 - TABLE_EDGE_THICKNESS / 2, z: 0, rotY: Math.PI / 2 },
      // Right edge
      { x: TABLE_WIDTH / 2 + TABLE_EDGE_THICKNESS / 2, z: 0, rotY: Math.PI / 2 },
    ];

    for (const pos of edgePositions) {
      const edgeGeo = new THREE.BoxGeometry(
        TABLE_LENGTH + TABLE_EDGE_THICKNESS * 2,
        TABLE_EDGE_HEIGHT,
        TABLE_EDGE_THICKNESS
      );
      const edge = new THREE.Mesh(edgeGeo, woodMaterial);
      edge.position.set(pos.x, TABLE_EDGE_HEIGHT / 2 - TABLE_HEIGHT / 2, pos.z);
      if (pos.rotY) edge.rotation.y = pos.rotY;
      this.mesh.add(edge);
    }

    // Table legs
    const legGeo = new THREE.CylinderGeometry(0.15, 0.2, TABLE_EDGE_HEIGHT, 8);
    const legPositions = [
      { x: -TABLE_WIDTH / 2 + 0.5, z: -TABLE_LENGTH / 2 + 0.5 },
      { x: TABLE_WIDTH / 2 - 0.5, z: -TABLE_LENGTH / 2 + 0.5 },
      { x: -TABLE_WIDTH / 2 + 0.5, z: TABLE_LENGTH / 2 - 0.5 },
      { x: TABLE_WIDTH / 2 - 0.5, z: TABLE_LENGTH / 2 - 0.5 },
    ];

    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeo, woodMaterial);
      leg.position.set(pos.x, -TABLE_HEIGHT - TABLE_EDGE_HEIGHT / 2, pos.z);
      this.mesh.add(leg);
    }

    // Center line marking (subtle)
    const lineGeo = new THREE.PlaneGeometry(0.03, TABLE_LENGTH - 2);
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.1,
    });
    const centerLine = new THREE.Mesh(lineGeo, lineMat);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.y = 0.01;
    this.mesh.add(centerLine);

    // Center circle (subtle)
    const circleGeo = new THREE.RingGeometry(0.8, 0.85, 32);
    const circleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
    });
    const circle = new THREE.Mesh(circleGeo, circleMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.01;
    this.mesh.add(circle);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(40, 40);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x2c1810,
      roughness: 0.8,
      metalness: 0.0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -TABLE_HEIGHT - TABLE_EDGE_HEIGHT - 0.01;
    this.mesh.add(floor);

    // Background wall
    const wallGeo = new THREE.PlaneGeometry(40, 15);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 1.0,
      metalness: 0.0,
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 5, -TABLE_LENGTH / 2 - 5);
    this.mesh.add(wall);

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.mesh.add(ambientLight);

    // Main overhead light (warm)
    const mainLight = new THREE.PointLight(0xffe0b0, 1.5, 30);
    mainLight.position.set(0, 8, 0);
    mainLight.castShadow = true;
    this.mesh.add(mainLight);

    // Accent lights for depth
    const accentLight1 = new THREE.PointLight(0xffc107, 0.5, 20);
    accentLight1.position.set(-5, 4, -5);
    this.mesh.add(accentLight1);

    const accentLight2 = new THREE.PointLight(0xffc107, 0.5, 20);
    accentLight2.position.set(5, 4, -5);
    this.mesh.add(accentLight2);

    // Subtle rim light from behind
    const rimLight = new THREE.DirectionalLight(0x4488ff, 0.2);
    rimLight.position.set(0, 3, -10);
    this.mesh.add(rimLight);
  }

  get group(): THREE.Group {
    return this.mesh;
  }

  /**
   * Highlight a zone on the table (e.g., where to play a card)
   */
  highlightZone(x: number, z: number, color: number = 0xffff00, size: number = 1.5): void {
    this.removeHighlight();

    const geo = new THREE.PlaneGeometry(size, size * 1.4);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    this.highlightMesh = new THREE.Mesh(geo, mat);
    this.highlightMesh.rotation.x = -Math.PI / 2;
    this.highlightMesh.position.set(x, 0.02, z);
    this.mesh.add(this.highlightMesh);
  }

  removeHighlight(): void {
    if (this.highlightMesh) {
      this.mesh.remove(this.highlightMesh);
      this.highlightMesh.geometry.dispose();
      const mat = this.highlightMesh.material;
      if (Array.isArray(mat)) {
        for (const m of mat) m.dispose();
      } else {
        mat.dispose();
      }
      this.highlightMesh = null;
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
