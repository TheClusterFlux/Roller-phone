const TAU = Math.PI * 2;

const COLOR_SCHEMES = [
  { bg: '#0a0a0a', wall: '#ff2d55', hex: '#ff2d55', tri: '#ffffff' },
  { bg: '#0a0a1a', wall: '#5856d6', hex: '#5856d6', tri: '#ffffff' },
  { bg: '#0a1a0a', wall: '#30d158', hex: '#30d158', tri: '#ffffff' },
  { bg: '#1a0a1a', wall: '#bf5af2', hex: '#bf5af2', tri: '#ffffff' },
  { bg: '#1a1a0a', wall: '#ffd60a', hex: '#ffd60a', tri: '#ffffff' },
  { bg: '#0a1a1a', wall: '#64d2ff', hex: '#64d2ff', tri: '#ffffff' },
];

export class HexRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cx = 0;
    this.cy = 0;
    this.scale = 1;
    this.colorScheme = COLOR_SCHEMES[0];
    this.bgFlash = 0;
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx = w / 2;
    this.cy = h / 2;
    this.scale = Math.min(w, h) * 0.42;
  }

  setColorScheme(index) {
    this.colorScheme = COLOR_SCHEMES[index % COLOR_SCHEMES.length];
  }

  flash() {
    this.bgFlash = 1;
  }

  render(state) {
    const { ctx, cx, cy, scale } = this;
    const { worldRotation, playerAngle, walls, hexRadius, energy, time } = state;

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    // Background
    const bgColor = this.colorScheme.bg;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Background flash on beat
    if (this.bgFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.bgFlash * 0.06})`;
      ctx.fillRect(0, 0, w, h);
      this.bgFlash *= 0.85;
      if (this.bgFlash < 0.01) this.bgFlash = 0;
    }

    ctx.save();
    ctx.translate(cx, cy);

    // Draw alternating background sectors (rotates with world)
    this._drawBackgroundSectors(ctx, scale, worldRotation, w, h);

    // Draw walls (rotate with world)
    for (const wall of walls) {
      this._drawWall(ctx, scale, worldRotation, wall, energy);
    }

    // Central hexagon (rotates with world)
    this._drawHexagon(ctx, hexRadius * scale, worldRotation, energy);

    // Player triangle (fixed in physical space — does NOT rotate with world)
    this._drawPlayer(ctx, hexRadius * scale + 10, playerAngle);

    ctx.restore();
  }

  _drawBackgroundSectors(ctx, scale, rotation, w, h) {
    const maxR = Math.sqrt(w * w + h * h);
    const sides = 6;
    const step = TAU / sides;
    const alpha = 0.04;

    for (let i = 0; i < sides; i++) {
      if (i % 2 === 0) continue;
      const a1 = rotation + i * step;
      const a2 = rotation + (i + 1) * step;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a1) * maxR, Math.sin(a1) * maxR);
      ctx.lineTo(Math.cos(a2) * maxR, Math.sin(a2) * maxR);
      ctx.closePath();
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
    }
  }

  _drawHexagon(ctx, radius, rotation, energy) {
    const sides = 6;
    const step = TAU / sides;
    const pulse = 1 + energy * 0.08;
    const r = radius * pulse;

    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rotation + i * step;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = this.colorScheme.hex;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Fill dark center
    ctx.fillStyle = this.colorScheme.bg;
    ctx.fill();
  }

  _drawPlayer(ctx, orbitRadius, angle) {
    const size = 8;
    const tipDist = orbitRadius + size;
    const baseDist = orbitRadius - 2;
    const halfBase = TAU / 60;

    const tipX = Math.cos(angle) * tipDist;
    const tipY = Math.sin(angle) * tipDist;
    const lx = Math.cos(angle - halfBase) * baseDist;
    const ly = Math.sin(angle - halfBase) * baseDist;
    const rx = Math.cos(angle + halfBase) * baseDist;
    const ry = Math.sin(angle + halfBase) * baseDist;

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(lx, ly);
    ctx.lineTo(rx, ry);
    ctx.closePath();
    ctx.fillStyle = this.colorScheme.tri;
    ctx.fill();
  }

  _drawWall(ctx, scale, rotation, wall, energy) {
    const { normalizedDist, gapStart, gapSize, sides } = wall;
    if (normalizedDist <= 0 || normalizedDist > 1.5) return;

    const innerR = normalizedDist * scale;
    const thickness = 12 + energy * 6;
    const outerR = innerR + thickness;
    const step = TAU / sides;

    const alpha = Math.min(1, normalizedDist * 1.5);

    for (let i = 0; i < sides; i++) {
      const gapEnd = gapStart + gapSize;
      const isGap = (i >= gapStart && i < gapEnd) ||
                    (gapEnd > sides && i < (gapEnd % sides));
      if (isGap) continue;

      const a1 = rotation + i * step;
      const a2 = rotation + (i + 1) * step;

      const ix1 = Math.cos(a1) * innerR;
      const iy1 = Math.sin(a1) * innerR;
      const ix2 = Math.cos(a2) * innerR;
      const iy2 = Math.sin(a2) * innerR;
      const ox1 = Math.cos(a1) * outerR;
      const oy1 = Math.sin(a1) * outerR;
      const ox2 = Math.cos(a2) * outerR;
      const oy2 = Math.sin(a2) * outerR;

      ctx.beginPath();
      ctx.moveTo(ix1, iy1);
      ctx.lineTo(ix2, iy2);
      ctx.lineTo(ox2, oy2);
      ctx.lineTo(ox1, oy1);
      ctx.closePath();
      ctx.fillStyle = this.colorScheme.wall;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  renderMenu() {
    const { ctx, cx, cy, scale } = this;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cx, cy);

    const t = performance.now() / 1000;
    const rotation = t * 0.3;

    this._drawBackgroundSectors(ctx, scale, rotation, w, h);
    this._drawHexagon(ctx, 40, rotation, 0);

    ctx.restore();
  }
}
