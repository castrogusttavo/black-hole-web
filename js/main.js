// ============================================================
// Main entry point — switches between 2D and 3D simulations
// ============================================================

import { Simulation2D } from './simulation2d.js';
import { Simulation3D } from './simulation3d.js';

const btn2d = document.getElementById('btn-2d');
const btn3d = document.getElementById('btn-3d');
const gravityLabel = document.getElementById('gravity-label');
const gridLabel = document.getElementById('grid-label');
const fpsDisplay = document.getElementById('fps-display');

let activeSim = null;
let mode = '2d';

// --- FPS counter ---
let frameCount = 0;
let lastFpsTime = performance.now();

function updateFps() {
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fpsDisplay.textContent = `FPS: ${frameCount}`;
    frameCount = 0;
    lastFpsTime = now;
  }
}

// --- Canvas management ---
// A canvas can only have ONE context type (2d OR webgl2).
// We must destroy and recreate the canvas when switching modes.

function createCanvas() {
  const old = document.getElementById('canvas');
  if (old) old.remove();
  const c = document.createElement('canvas');
  c.id = 'canvas';
  document.getElementById('app').appendChild(c);
  return c;
}

// --- Simulation lifecycle ---

function stopSim() {
  if (activeSim) {
    activeSim.stop();
    activeSim = null;
  }
}

function startSim(newMode) {
  stopSim();
  mode = newMode;

  btn2d.classList.toggle('active', mode === '2d');
  btn3d.classList.toggle('active', mode === '3d');
  gravityLabel.style.display = mode === '3d' ? '' : 'none';
  gridLabel.style.display = mode === '3d' ? '' : 'none';

  const canvas = createCanvas();

  if (mode === '2d') {
    activeSim = new Simulation2D(canvas, updateFps);
  } else {
    activeSim = new Simulation3D(canvas, updateFps);
  }

  activeSim.start();
}

// --- Tab buttons ---
btn2d.addEventListener('click', () => startSim('2d'));
btn3d.addEventListener('click', () => startSim('3d'));

// --- Boot ---
startSim('2d');
