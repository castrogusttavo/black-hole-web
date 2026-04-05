// ============================================================
// Spacetime curvature grid — ported from black_hole.cpp generateGrid
// ============================================================

import { G, C } from './physics.js';

/**
 * Generate a warped grid mesh on CPU.
 * Returns { vertices: Float32Array, indices: Uint32Array }
 */
export function generateGrid(objects, gridSize = 25, spacing = 1e10) {
  const verts = [];
  const indices = [];

  for (let z = 0; z <= gridSize; z++) {
    for (let x = 0; x <= gridSize; x++) {
      const worldX = (x - gridSize / 2) * spacing;
      const worldZ = (z - gridSize / 2) * spacing;
      let y = 0;

      for (const obj of objects) {
        const ox = obj.posRadius[0];
        const oz = obj.posRadius[2];
        const mass = obj.mass;
        const r_s = 2.0 * G * mass / (C * C);
        const dx = worldX - ox;
        const dz = worldZ - oz;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > r_s) {
          y += 2.0 * Math.sqrt(r_s * (dist - r_s)) - 3e10;
        } else {
          y += 2.0 * Math.sqrt(r_s * r_s) - 3e10;
        }
      }

      verts.push(worldX, y, worldZ);
    }
  }

  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      const i = z * (gridSize + 1) + x;
      indices.push(i, i + 1);
      indices.push(i, i + gridSize + 1);
    }
  }

  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array(indices),
  };
}
