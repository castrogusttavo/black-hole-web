// ============================================================
// WebGL2 renderer utilities
// ============================================================

/**
 * Initialize a WebGL2 context from a canvas element.
 * Returns the gl context or throws on failure.
 */
export function initWebGL2(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) throw new Error('WebGL2 not supported');
  return gl;
}

/**
 * Compile a single shader (vertex or fragment).
 */
export function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error:\n${log}`);
  }
  return shader;
}

/**
 * Link a vertex + fragment shader into a program.
 */
export function createProgram(gl, vertSrc, fragSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link error:\n${log}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

/**
 * Create a full-screen quad VAO (two triangles covering [-1,1]).
 * Attribute 0 = vec2 position, Attribute 1 = vec2 texcoord.
 */
export function createFullScreenQuad(gl) {
  const verts = new Float32Array([
    // pos       // uv
    -1,  1,      0, 1,
    -1, -1,      0, 0,
     1, -1,      1, 0,
    -1,  1,      0, 1,
     1, -1,      1, 0,
     1,  1,      1, 1,
  ]);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  // position
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  // texcoord
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  gl.bindVertexArray(null);
  return vao;
}

/**
 * Resize canvas to match its display size (handles devicePixelRatio).
 * Returns true if the size changed.
 */
export function resizeCanvas(canvas, gl) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    return true;
  }
  return false;
}
