// ============================================================
// 2-D Gravitational Lensing Simulation  (Canvas 2D)
// Ported from 2D_lensing.cpp
// ============================================================

import { SagA, C, rk4Step2D } from './physics.js';

// --- Ray class (2-D, polar Schwarzschild) -----------------------

class Ray2D {
  constructor(px, py, dx, dy) {
    // Cartesian -> polar
    this.r   = Math.sqrt(px * px + py * py);
    this.phi = Math.atan2(py, px);

    // Seed polar velocities from Cartesian direction
    const cp = Math.cos(this.phi);
    const sp = Math.sin(this.phi);
    this.dr   = dx * cp + dy * sp;
    this.dphi = (-dx * sp + dy * cp) / this.r;

    // Conserved quantities
    this.L = this.r * this.r * this.dphi;
    const f = 1.0 - SagA.r_s / this.r;
    const dt_dl = Math.sqrt((this.dr * this.dr) / (f * f) + (this.r * this.r * this.dphi * this.dphi) / f);
    this.E = f * dt_dl;

    // Cartesian position (updated each step)
    this.x = px;
    this.y = py;

    // Trail of previous positions
    this.trail = [{ x: px, y: py }];
  }

  step(dl) {
    if (this.r <= SagA.r_s) return;
    rk4Step2D(this, dl, SagA.r_s);
    this.x = this.r * Math.cos(this.phi);
    this.y = this.r * Math.sin(this.phi);
    this.trail.push({ x: this.x, y: this.y });
  }
}

// --- Simulation orchestrator ------------------------------------

export class Simulation2D {
  constructor(canvas, onFrame) {
    this.canvas = canvas;
    this.ctx = null;
    this.onFrame = onFrame;
    this.running = false;
    this.rafId = null;

    // Viewport (world coords, metres)
    this.viewWidth  = 100000000000;   // 1e11 m
    this.viewHeight = 75000000000;    // 7.5e10 m
    this.offsetX = 0;
    this.offsetY = 0;
    this.zoom = 1;

    // Interaction
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp   = this._onMouseUp.bind(this);
    this._onWheel     = this._onWheel.bind(this);
    this._onClick     = this._onClick.bind(this);
    this.dragging = false;
    this.lastMX = 0;
    this.lastMY = 0;

    this.rays = [];
    this.dl = 1.0; // affine parameter step
  }

  // --- lifecycle ------------------------------------------------

  start() {
    this.ctx = this.canvas.getContext('2d');
    this._resize();
    this._bindEvents();
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this._unbindEvents();
  }

  // --- render loop ----------------------------------------------

  _loop() {
    if (!this.running) return;
    this._resize();
    this._update();
    this._draw();
    this.onFrame();
    this.rafId = requestAnimationFrame(() => this._loop());
  }

  _update() {
    for (const ray of this.rays) {
      ray.step(this.dl);
    }
  }

  _draw() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // world -> screen transform
    const scaleX = w / (this.viewWidth * 2 / this.zoom);
    const scaleY = h / (this.viewHeight * 2 / this.zoom);
    const scale = Math.min(scaleX, scaleY);
    const cx = w / 2;
    const cy = h / 2;

    const toScreen = (wx, wy) => ({
      sx: cx + (wx - this.offsetX) * scale,
      sy: cy - (wy - this.offsetY) * scale,  // flip Y
    });

    // Draw black hole (event horizon)
    const bhScreen = toScreen(SagA.x, SagA.y);
    const rScreen = SagA.r_s * scale;
    ctx.beginPath();
    ctx.arc(bhScreen.sx, bhScreen.sy, Math.max(rScreen, 3), 0, Math.PI * 2);
    ctx.fillStyle = '#ff0000';
    ctx.fill();

    // Draw photon sphere (1.5 * r_s)
    ctx.beginPath();
    ctx.arc(bhScreen.sx, bhScreen.sy, 1.5 * SagA.r_s * scale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,100,0,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw ray trails
    for (const ray of this.rays) {
      const N = ray.trail.length;
      if (N < 2) continue;

      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const { sx, sy } = toScreen(ray.trail[i].x, ray.trail[i].y);
        const alpha = Math.max(i / (N - 1), 0.05);
        if (i === 0) {
          ctx.moveTo(sx, sy);
        } else {
          ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
          ctx.beginPath();
          const prev = toScreen(ray.trail[i - 1].x, ray.trail[i - 1].y);
          ctx.moveTo(prev.sx, prev.sy);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }
      }

      // Draw current position as red dot
      const tip = toScreen(ray.x, ray.y);
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(tip.sx, tip.sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Instructions
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '13px monospace';
    ctx.fillText('Click to shoot a ray  |  Scroll to zoom  |  Middle-drag to pan', 12, h - 12);
  }

  // --- input ----------------------------------------------------

  _bindEvents() {
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
    this.canvas.addEventListener('click', this._onClick);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _unbindEvents() {
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('click', this._onClick);
  }

  _screenToWorld(sx, sy) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const scaleX = w / (this.viewWidth * 2 / this.zoom);
    const scaleY = h / (this.viewHeight * 2 / this.zoom);
    const scale = Math.min(scaleX, scaleY);
    const cx = w / 2;
    const cy = h / 2;
    return {
      wx: (sx - cx) / scale + this.offsetX,
      wy: -(sy - cy) / scale + this.offsetY,
    };
  }

  _onClick(e) {
    if (e.button !== 0) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const sx = (e.clientX - rect.left) * dpr;
    const sy = (e.clientY - rect.top) * dpr;
    const { wx, wy } = this._screenToWorld(sx, sy);

    // Shoot ray from click position toward the right (positive x)
    this.rays.push(new Ray2D(wx, wy, C, 0));
  }

  _onMouseDown(e) {
    if (e.button === 1) { // middle mouse
      this.dragging = true;
      this.lastMX = e.clientX;
      this.lastMY = e.clientY;
      e.preventDefault();
    }
  }

  _onMouseMove(e) {
    if (!this.dragging) return;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const scaleX = w / (this.viewWidth * 2 / this.zoom);
    const scaleY = h / (this.viewHeight * 2 / this.zoom);
    const scale = Math.min(scaleX, scaleY);

    const dx = (e.clientX - this.lastMX) * dpr;
    const dy = (e.clientY - this.lastMY) * dpr;
    this.offsetX -= dx / scale;
    this.offsetY += dy / scale;
    this.lastMX = e.clientX;
    this.lastMY = e.clientY;
  }

  _onMouseUp(e) {
    if (e.button === 1) this.dragging = false;
  }

  _onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoom *= factor;
    this.zoom = Math.max(0.01, Math.min(100, this.zoom));
  }

  // --- helpers --------------------------------------------------

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }
}
