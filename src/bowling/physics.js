import { LANE_WIDTH, LANE_LENGTH } from './scene.js';

const GUTTER_THRESHOLD = LANE_WIDTH / 2;

export class BallPhysics {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = 0;
    this.z = 0;
    this.vx = 0;
    this.vz = 0;
    this.spin = 0;
    this.active = false;
    this.inGutter = false;
    this.reachedPins = false;
    this.time = 0;
  }

  launch(startX, power, angle, spin) {
    this.x = startX;
    this.z = 0;
    this.vz = -(8 + power * 10); // forward speed: 8-18 m/s
    this.vx = Math.sin(angle * Math.PI / 180) * Math.abs(this.vz) * 0.3;
    this.spin = spin;
    this.active = true;
    this.inGutter = false;
    this.reachedPins = false;
    this.time = 0;
  }

  update(dt) {
    if (!this.active) return;

    this.time += dt;

    // Spin creates a curve that increases over distance
    const spinForce = this.spin * 2.0 * Math.min(1, this.time * 1.5);
    this.vx += spinForce * dt;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // Gutter check
    if (Math.abs(this.x) > GUTTER_THRESHOLD && !this.inGutter) {
      this.inGutter = true;
      this.vx *= 0.3;
    }

    if (this.inGutter) {
      this.x = Math.sign(this.x) * (GUTTER_THRESHOLD + 0.1);
    }

    // Slight friction
    this.vz *= (1 - 0.1 * dt);

    const pinZone = -LANE_LENGTH + 2;
    if (this.z <= pinZone) {
      this.reachedPins = true;
      this.active = false;
    }

    if (this.z < -LANE_LENGTH - 1) {
      this.active = false;
    }
  }

  getPosition() {
    return { x: this.x, z: this.z };
  }
}

export function calculatePinKnockdown(ballX, ballPower, ballSpin, pinPositions, pinStanding) {
  const knocked = [];

  if (Math.abs(ballX) > GUTTER_THRESHOLD) {
    return knocked;
  }

  const hitRadius = 0.15;
  const chainRadius = 0.35;
  const knockProbBase = 0.5 + ballPower * 0.5;

  // Direct ball hits
  for (let i = 0; i < pinPositions.length; i++) {
    if (!pinStanding[i]) continue;
    const dx = ballX - pinPositions[i].x;
    if (Math.abs(dx) < hitRadius) {
      knocked.push(i);
    }
  }

  // Chain reactions (up to 3 iterations)
  for (let iter = 0; iter < 3; iter++) {
    const newKnocks = [];
    for (const ki of knocked) {
      for (let i = 0; i < pinPositions.length; i++) {
        if (!pinStanding[i] || knocked.includes(i) || newKnocks.includes(i)) continue;
        const dx = pinPositions[ki].x - pinPositions[i].x;
        const dz = pinPositions[ki].z - pinPositions[i].z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < chainRadius && Math.random() < knockProbBase) {
          newKnocks.push(i);
        }
      }
    }
    if (newKnocks.length === 0) break;
    knocked.push(...newKnocks);
  }

  return [...new Set(knocked)];
}
