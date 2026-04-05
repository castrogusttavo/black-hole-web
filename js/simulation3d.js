// ============================================================
// 3-D Black Hole Simulation (WebGL2 fragment-shader ray tracer)
// Ported from black_hole.cpp + geodesic.comp
//
// Key: renders geodesic shader at LOW resolution (200x150)
// into an FBO, then upscales to screen — same as the C++ version.
// ============================================================

import { initWebGL2, createProgram, createFullScreenQuad, resizeCanvas } from './renderer.js';
import { Camera } from './camera.js';
import { G, C, SagA } from './physics.js';
import { generateGrid } from './grid.js';
import {
  v3Sub, v3Cross, v3Normalize,
  m4LookAt, m4Perspective, m4Multiply, toRad,
} from './math.js';

// --- Low-res compute dimensions (same as C++) ---
const COMPUTE_W = 200;
const COMPUTE_H = 150;

// --- Shader sources ---

const QUAD_VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aTexCoord;
out vec2 vTexCoord;
void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
    vTexCoord = aTexCoord;
}`;

// Simple passthrough: sample the low-res texture and draw to screen
const BLIT_FRAG = `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 fragColor;
uniform sampler2D uTexture;
void main() {
    fragColor = texture(uTexture, vTexCoord);
}`;

const GEODESIC_FRAG = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec3 camPos;
uniform vec3 camRight;
uniform vec3 camUp;
uniform vec3 camForward;
uniform float tanHalfFov;
uniform float aspect;

uniform float disk_r1;
uniform float disk_r2;
uniform float uThickness;

uniform int numObjects;
uniform vec4 objPosRadius[16];
uniform vec4 objColor[16];
uniform float uMass[16];

uniform vec2 resolution;

const float SagA_rs = 1.269e10;
const float D_LAMBDA = 1.5e8;
const float ESCAPE_R = 1e12;
const int MAX_STEPS = 4000;

vec4 hitObjColor;
vec3 hitCenter;
float hitRadius;

struct Ray {
    float x, y, z, r, theta, phi;
    float dr, dtheta, dphi;
    float E, L;
};

Ray initRay(vec3 pos, vec3 dir) {
    Ray ray;
    ray.x = pos.x; ray.y = pos.y; ray.z = pos.z;
    ray.r = length(pos);
    ray.theta = acos(clamp(pos.z / ray.r, -1.0, 1.0));
    ray.phi = atan(pos.y, pos.x);

    float dx = dir.x, dy = dir.y, dz = dir.z;
    float st = sin(ray.theta), ct = cos(ray.theta);
    float sp = sin(ray.phi), cp = cos(ray.phi);
    ray.dr     = st*cp*dx + st*sp*dy + ct*dz;
    ray.dtheta = (ct*cp*dx + ct*sp*dy - st*dz) / ray.r;
    float sinTheta = max(abs(st), 1e-8);
    ray.dphi   = (-sp*dx + cp*dy) / (ray.r * sinTheta);

    ray.L = ray.r * ray.r * sinTheta * ray.dphi;
    float f = 1.0 - SagA_rs / ray.r;
    float dt_dL = sqrt(abs((ray.dr*ray.dr)/f + ray.r*ray.r*(ray.dtheta*ray.dtheta + sinTheta*sinTheta*ray.dphi*ray.dphi)));
    ray.E = f * dt_dL;

    return ray;
}

bool intercept(Ray ray, float rs) {
    return ray.r <= rs;
}

bool interceptObject(Ray ray) {
    vec3 P = vec3(ray.x, ray.y, ray.z);
    for (int i = 0; i < 16; ++i) {
        if (i >= numObjects) break;
        vec3 center = objPosRadius[i].xyz;
        float radius = objPosRadius[i].w;
        if (distance(P, center) <= radius) {
            hitObjColor = objColor[i];
            hitCenter = center;
            hitRadius = radius;
            return true;
        }
    }
    return false;
}

void geodesicRHS(Ray ray, out vec3 d1, out vec3 d2) {
    float r = ray.r, theta = ray.theta;
    float dr = ray.dr, dtheta = ray.dtheta, dphi = ray.dphi;
    float f = 1.0 - SagA_rs / r;
    float dt_dL = ray.E / f;

    d1 = vec3(dr, dtheta, dphi);
    d2.x = -(SagA_rs / (2.0 * r*r)) * f * dt_dL * dt_dL
         + (SagA_rs / (2.0 * r*r * f)) * dr * dr
         + r * (dtheta*dtheta + sin(theta)*sin(theta)*dphi*dphi);
    d2.y = -2.0*dr*dtheta/r + sin(theta)*cos(theta)*dphi*dphi;
    float sinT = max(abs(sin(theta)), 1e-8);
    d2.z = -2.0*dr*dphi/r - 2.0*cos(theta)/sinT * dtheta * dphi;
}

void rk4Step(inout Ray ray, float dL) {
    vec3 k1a, k1b;
    geodesicRHS(ray, k1a, k1b);

    ray.r      += dL * k1a.x;
    ray.theta  += dL * k1a.y;
    ray.phi    += dL * k1a.z;
    ray.dr     += dL * k1b.x;
    ray.dtheta += dL * k1b.y;
    ray.dphi   += dL * k1b.z;

    ray.x = ray.r * sin(ray.theta) * cos(ray.phi);
    ray.y = ray.r * sin(ray.theta) * sin(ray.phi);
    ray.z = ray.r * cos(ray.theta);
}

bool crossesEquatorialPlane(vec3 oldPos, vec3 newPos) {
    bool crossed = (oldPos.y * newPos.y < 0.0);
    float r = length(vec2(newPos.x, newPos.z));
    return crossed && (r >= disk_r1 && r <= disk_r2);
}

void main() {
    vec2 pix = gl_FragCoord.xy;
    float W = resolution.x;
    float H = resolution.y;

    float u = (2.0 * (pix.x + 0.5) / W - 1.0) * aspect * tanHalfFov;
    float v = (1.0 - 2.0 * (pix.y + 0.5) / H) * tanHalfFov;
    vec3 dir = normalize(u * camRight - v * camUp + camForward);
    Ray ray = initRay(camPos, dir);

    vec4 color = vec4(0.0);
    vec3 prevPos = vec3(ray.x, ray.y, ray.z);

    bool hitBlackHole = false;
    bool hitDisk      = false;
    bool hitObject    = false;

    for (int i = 0; i < MAX_STEPS; ++i) {
        if (intercept(ray, SagA_rs)) { hitBlackHole = true; break; }
        rk4Step(ray, D_LAMBDA);

        vec3 newPos = vec3(ray.x, ray.y, ray.z);
        if (crossesEquatorialPlane(prevPos, newPos)) { hitDisk = true; break; }
        if (interceptObject(ray)) { hitObject = true; break; }
        prevPos = newPos;
        if (ray.r > ESCAPE_R) break;
    }

    if (hitDisk) {
        float r = length(vec3(ray.x, ray.y, ray.z)) / disk_r2;
        vec3 diskColor = vec3(1.0, r, 0.2);
        color = vec4(diskColor, r);
    } else if (hitBlackHole) {
        color = vec4(0.0, 0.0, 0.0, 1.0);
    } else if (hitObject) {
        vec3 P = vec3(ray.x, ray.y, ray.z);
        vec3 N = normalize(P - hitCenter);
        vec3 V = normalize(camPos - P);
        float ambient = 0.1;
        float diff = max(dot(N, V), 0.0);
        float intensity = ambient + (1.0 - ambient) * diff;
        vec3 shaded = hitObjColor.rgb * intensity;
        color = vec4(shaded, hitObjColor.a);
    } else {
        color = vec4(0.0);
    }

    fragColor = color;
}`;

const GRID_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
uniform mat4 viewProj;
void main() {
    gl_Position = viewProj * vec4(aPos, 1.0);
}`;

const GRID_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
    fragColor = vec4(0.5, 0.5, 0.5, 0.7);
}`;

// --- Objects (same as black_hole.cpp) ---

const objects = [
  { posRadius: [4e11, 0, 0, 4e10],    color: [1, 1, 0, 1], mass: 1.98892e30, velocity: [0, 0, 0] },
  { posRadius: [0, 0, 4e11, 4e10],    color: [1, 0, 0, 1], mass: 1.98892e30, velocity: [0, 0, 0] },
  { posRadius: [0, 0, 0, SagA.r_s],   color: [0, 0, 0, 1], mass: SagA.mass,  velocity: [0, 0, 0] },
];

// --- Simulation class ---

export class Simulation3D {
  constructor(canvas, onFrame) {
    this.canvas = canvas;
    this.onFrame = onFrame;
    this.running = false;
    this.rafId = null;
    this.gl = null;
    this.camera = new Camera();
    this.showGrid = true;

    this._onMouseDown = (e) => this.camera.onMouseDown(e);
    this._onMouseMove = (e) => this.camera.onMouseMove(e);
    this._onMouseUp   = (e) => this.camera.onMouseUp(e);
    this._onWheel     = (e) => { e.preventDefault(); this.camera.onWheel(e); };
    this._onKeyDown   = (e) => this.camera.onKeyDown(e);
  }

  start() {
    const gl = initWebGL2(this.canvas);
    this.gl = gl;

    // --- Compile shaders ---
    this.geodesicProg = createProgram(gl, QUAD_VERT, GEODESIC_FRAG);
    this.blitProg     = createProgram(gl, QUAD_VERT, BLIT_FRAG);
    this.gridProg     = createProgram(gl, GRID_VERT, GRID_FRAG);
    this.quadVAO      = createFullScreenQuad(gl);

    // --- Create low-res FBO (200x150) for geodesic rendering ---
    this.fbo = gl.createFramebuffer();
    this.fboTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, COMPUTE_W, COMPUTE_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // --- Cache geodesic uniform locations ---
    const gp = this.geodesicProg;
    this.uLoc = {
      camPos:      gl.getUniformLocation(gp, 'camPos'),
      camRight:    gl.getUniformLocation(gp, 'camRight'),
      camUp:       gl.getUniformLocation(gp, 'camUp'),
      camForward:  gl.getUniformLocation(gp, 'camForward'),
      tanHalfFov:  gl.getUniformLocation(gp, 'tanHalfFov'),
      aspect:      gl.getUniformLocation(gp, 'aspect'),
      disk_r1:     gl.getUniformLocation(gp, 'disk_r1'),
      disk_r2:     gl.getUniformLocation(gp, 'disk_r2'),
      thickness:   gl.getUniformLocation(gp, 'uThickness'),
      numObjects:  gl.getUniformLocation(gp, 'numObjects'),
      resolution:  gl.getUniformLocation(gp, 'resolution'),
    };
    this.uLocArrays = { objPosRadius: [], objColor: [], mass: [] };
    for (let i = 0; i < 16; i++) {
      this.uLocArrays.objPosRadius.push(gl.getUniformLocation(gp, `objPosRadius[${i}]`));
      this.uLocArrays.objColor.push(gl.getUniformLocation(gp, `objColor[${i}]`));
      this.uLocArrays.mass.push(gl.getUniformLocation(gp, `uMass[${i}]`));
    }

    // --- Blit uniform ---
    this.uBlitTex = gl.getUniformLocation(this.blitProg, 'uTexture');

    // --- Grid buffers ---
    this.gridVAO = gl.createVertexArray();
    this.gridVBO = gl.createBuffer();
    this.gridEBO = gl.createBuffer();
    this.gridIndexCount = 0;
    this.uGridViewProj = gl.getUniformLocation(this.gridProg, 'viewProj');

    this._bindEvents();
    this.running = true;

    // Connect UI toggles
    const gravToggle = document.getElementById('toggle-gravity');
    const gridToggle = document.getElementById('toggle-grid');
    if (gravToggle) {
      gravToggle.checked = this.camera.gravity;
      gravToggle.addEventListener('change', () => { this.camera.gravity = gravToggle.checked; });
    }
    if (gridToggle) {
      gridToggle.checked = this.showGrid;
      gridToggle.addEventListener('change', () => { this.showGrid = gridToggle.checked; });
    }

    this._loop();
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this._unbindEvents();
  }

  _loop() {
    if (!this.running) return;
    const gl = this.gl;
    resizeCanvas(this.canvas, gl);

    this._updateGravity();
    this._uploadGridMesh();

    // ========== PASS 1: Render geodesic to low-res FBO ==========
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, COMPUTE_W, COMPUTE_H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this._drawGeodesic();

    // ========== PASS 2: Blit FBO texture to screen (upscale) ==========
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.blitProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.uniform1i(this.uBlitTex, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // ========== PASS 3: Draw grid overlay ==========
    if (this.showGrid) {
      this._drawGrid();
    }

    this.onFrame();
    this.rafId = requestAnimationFrame(() => this._loop());
  }

  _drawGeodesic() {
    const gl = this.gl;
    const pos = this.camera.position();
    const fwd = v3Normalize(v3Sub(this.camera.target, pos));
    const worldUp = [0, 1, 0];
    const right = v3Normalize(v3Cross(fwd, worldUp));
    const up = v3Cross(right, fwd);

    gl.useProgram(this.geodesicProg);

    // Camera uniforms
    gl.uniform3fv(this.uLoc.camPos, pos);
    gl.uniform3fv(this.uLoc.camRight, right);
    gl.uniform3fv(this.uLoc.camUp, up);
    gl.uniform3fv(this.uLoc.camForward, fwd);
    gl.uniform1f(this.uLoc.tanHalfFov, Math.tan(toRad(60) * 0.5));
    gl.uniform1f(this.uLoc.aspect, this.canvas.width / this.canvas.height);
    // Resolution = the FBO size, not the canvas size!
    gl.uniform2f(this.uLoc.resolution, COMPUTE_W, COMPUTE_H);

    // Disk
    const r1 = SagA.r_s * 2.2;
    const r2 = SagA.r_s * 5.2;
    gl.uniform1f(this.uLoc.disk_r1, r1);
    gl.uniform1f(this.uLoc.disk_r2, r2);
    gl.uniform1f(this.uLoc.thickness, 1e9);

    // Objects
    gl.uniform1i(this.uLoc.numObjects, objects.length);
    for (let i = 0; i < objects.length; i++) {
      gl.uniform4fv(this.uLocArrays.objPosRadius[i], objects[i].posRadius);
      gl.uniform4fv(this.uLocArrays.objColor[i], objects[i].color);
      gl.uniform1f(this.uLocArrays.mass[i], objects[i].mass);
    }

    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  _drawGrid() {
    const gl = this.gl;
    if (this.gridIndexCount === 0) return;

    const pos = this.camera.position();
    const view = m4LookAt(pos, this.camera.target, [0, 1, 0]);
    const proj = m4Perspective(toRad(60), this.canvas.width / this.canvas.height, 1e9, 1e14);
    const viewProj = m4Multiply(proj, view);

    gl.useProgram(this.gridProg);
    gl.uniformMatrix4fv(this.uGridViewProj, false, viewProj);

    gl.bindVertexArray(this.gridVAO);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElements(gl.LINES, this.gridIndexCount, gl.UNSIGNED_INT, 0);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
  }

  _uploadGridMesh() {
    const gl = this.gl;
    const { vertices, indices } = generateGrid(objects);

    gl.bindVertexArray(this.gridVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridVBO);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.gridEBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    this.gridIndexCount = indices.length;
    gl.bindVertexArray(null);
  }

  _updateGravity() {
    if (!this.camera.gravity) return;
    for (let a = 0; a < objects.length; a++) {
      for (let b = 0; b < objects.length; b++) {
        if (a === b) continue;
        const oa = objects[a], ob = objects[b];
        const dx = ob.posRadius[0] - oa.posRadius[0];
        const dy = ob.posRadius[1] - oa.posRadius[1];
        const dz = ob.posRadius[2] - oa.posRadius[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= 0) continue;
        const F = (G * oa.mass * ob.mass) / (dist * dist);
        const acc = F / oa.mass;
        oa.velocity[0] += (dx / dist) * acc;
        oa.velocity[1] += (dy / dist) * acc;
        oa.velocity[2] += (dz / dist) * acc;
      }
    }
    for (const obj of objects) {
      obj.posRadius[0] += obj.velocity[0];
      obj.posRadius[1] += obj.velocity[1];
      obj.posRadius[2] += obj.velocity[2];
    }
  }

  _bindEvents() {
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('keydown', this._onKeyDown);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _unbindEvents() {
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('keydown', this._onKeyDown);
  }
}
