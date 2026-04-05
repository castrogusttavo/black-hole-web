// ============================================================
// Orbital Camera — ported from black_hole.cpp Camera struct
// ============================================================

export class Camera {
  constructor() {
    this.target = [0, 0, 0];
    this.radius = 6.34194e10;
    this.minRadius = 1e10;
    this.maxRadius = 1e12;

    this.azimuth = 0;
    this.elevation = Math.PI / 2;

    this.orbitSpeed = 0.01;
    this.zoomSpeed = 25e9;

    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;

    this.gravity = false;
  }

  position() {
    const el = Math.max(0.01, Math.min(Math.PI - 0.01, this.elevation));
    return [
      this.radius * Math.sin(el) * Math.cos(this.azimuth),
      this.radius * Math.cos(el),
      this.radius * Math.sin(el) * Math.sin(this.azimuth),
    ];
  }

  onMouseDown(e) {
    if (e.button === 0) { // left mouse
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }
  }

  onMouseMove(e) {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.azimuth += dx * this.orbitSpeed;
    this.elevation -= dy * this.orbitSpeed;
    this.elevation = Math.max(0.01, Math.min(Math.PI - 0.01, this.elevation));
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  onMouseUp(e) {
    if (e.button === 0) this.dragging = false;
  }

  onWheel(e) {
    this.radius -= (e.deltaY > 0 ? -1 : 1) * this.zoomSpeed;
    this.radius = Math.max(this.minRadius, Math.min(this.maxRadius, this.radius));
  }

  onKeyDown(e) {
    if (e.key === 'g' || e.key === 'G') {
      this.gravity = !this.gravity;
    }
  }
}
