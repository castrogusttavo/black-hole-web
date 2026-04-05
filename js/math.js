// ============================================================
// Minimal vec3 / vec4 / mat4 math library (replaces GLM)
// ============================================================

// --- vec3 -----------------------------------------------------------

export function v3(x = 0, y = 0, z = 0) { return [x, y, z]; }

export function v3Add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function v3Sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function v3Scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
export function v3Dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function v3Cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export function v3Len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
export function v3Normalize(a) {
  const l = v3Len(a);
  return l === 0 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
}
export function v3Negate(a) { return [-a[0], -a[1], -a[2]]; }

// --- mat4 (column-major Float32Array, WebGL-ready) ------------------

export function m4Identity() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

export function m4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

export function m4LookAt(eye, center, up) {
  const f = v3Normalize(v3Sub(center, eye));
  const s = v3Normalize(v3Cross(f, up));
  const u = v3Cross(s, f);
  // column-major
  return new Float32Array([
     s[0],  u[0], -f[0], 0,
     s[1],  u[1], -f[1], 0,
     s[2],  u[2], -f[2], 0,
    -v3Dot(s, eye), -v3Dot(u, eye), v3Dot(f, eye), 1,
  ]);
}

export function m4Perspective(fovRad, aspect, near, far) {
  const t = Math.tan(fovRad / 2);
  const out = new Float32Array(16);
  out[0]  = 1 / (aspect * t);
  out[5]  = 1 / t;
  out[10] = -(far + near) / (far - near);
  out[11] = -1;
  out[14] = -(2 * far * near) / (far - near);
  return out;
}

export function toRad(deg) { return deg * Math.PI / 180; }
