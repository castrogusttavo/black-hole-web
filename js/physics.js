// ============================================================
// Physics constants and black-hole helpers
// ============================================================

export const C = 299792458.0;           // speed of light (m/s)
export const G = 6.67430e-11;           // gravitational constant

export class BlackHole {
  constructor(x, y, mass) {
    this.x = x;
    this.y = y;
    this.mass = mass;
    this.r_s = 2.0 * G * mass / (C * C);  // Schwarzschild radius
  }
}

// Default: Sagittarius A*
export const SagA = new BlackHole(0, 0, 8.54e36);

// ============================================================
// 2-D Schwarzschild null-geodesic integration (polar coords)
// Ported from 2D_lensing.cpp
// ============================================================

/**
 * RHS of the geodesic ODE system for a 2-D ray in Schwarzschild metric.
 * State = [r, phi, dr, dphi]
 * Returns [dr, dphi, d2r, d2phi].
 */
export function geodesicRHS2D(r, phi, dr, dphi, E, rs) {
  const f = 1.0 - rs / r;
  const dt_dl = E / f;

  const d2r =
    -(rs / (2 * r * r)) * f * dt_dl * dt_dl +
     (rs / (2 * r * r * f)) * dr * dr +
     (r - rs) * dphi * dphi;

  const d2phi = -2.0 * dr * dphi / r;

  return [dr, dphi, d2r, d2phi];
}

/**
 * 4th-order Runge-Kutta step for the 2-D geodesic.
 * Mutates the ray object in-place.
 */
export function rk4Step2D(ray, dl, rs) {
  const { r, phi, dr, dphi, E } = ray;
  const y0 = [r, phi, dr, dphi];

  const k1 = geodesicRHS2D(y0[0], y0[1], y0[2], y0[3], E, rs);

  const y1 = y0.map((v, i) => v + k1[i] * dl / 2);
  const k2 = geodesicRHS2D(y1[0], y1[1], y1[2], y1[3], E, rs);

  const y2 = y0.map((v, i) => v + k2[i] * dl / 2);
  const k3 = geodesicRHS2D(y2[0], y2[1], y2[2], y2[3], E, rs);

  const y3 = y0.map((v, i) => v + k3[i] * dl);
  const k4 = geodesicRHS2D(y3[0], y3[1], y3[2], y3[3], E, rs);

  ray.r    += (dl / 6) * (k1[0] + 2*k2[0] + 2*k3[0] + k4[0]);
  ray.phi  += (dl / 6) * (k1[1] + 2*k2[1] + 2*k3[1] + k4[1]);
  ray.dr   += (dl / 6) * (k1[2] + 2*k2[2] + 2*k3[2] + k4[2]);
  ray.dphi += (dl / 6) * (k1[3] + 2*k2[3] + 2*k3[3] + k4[3]);
}
