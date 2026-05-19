import { LANE_WIDTH, LANE_LENGTH } from './scene.js';

const GUTTER_THRESHOLD = LANE_WIDTH / 2;
const BALL_RADIUS = 0.109;
const PIN_RADIUS = 0.055;
const CONTACT_DIST = BALL_RADIUS + PIN_RADIUS;

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
    this.power = 0;
    this.active = false;
    this.inGutter = false;
    this.reachedPins = false;
    this.time = 0;
  }

  launch(startX, power, angle, spin) {
    this.x = startX;
    this.z = 0;
    this.power = power;

    // Forward speed: 4-16 m/s — weak throws visibly slow, strong throws fast
    this.vz = -(4 + power * 12);

    // Lateral velocity from release angle — larger effect
    this.vx = Math.sin(angle * Math.PI / 180) * Math.abs(this.vz) * 0.5;

    this.spin = spin;
    this.active = true;
    this.inGutter = false;
    this.reachedPins = false;
    this.time = 0;
  }

  update(dt) {
    if (!this.active) return;

    this.time += dt;

    // Spin curve builds gradually over distance (like a real bowling ball hook)
    const spinForce = this.spin * 2.5 * Math.min(1, this.time * 1.2);
    this.vx += spinForce * dt;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    if (Math.abs(this.x) > GUTTER_THRESHOLD && !this.inGutter) {
      this.inGutter = true;
      this.vx *= 0.2;
    }

    if (this.inGutter) {
      this.x = Math.sign(this.x) * (GUTTER_THRESHOLD + 0.1);
    }

    // Friction slows the ball
    const friction = this.power < 0.3 ? 0.3 : 0.08;
    this.vz *= (1 - friction * dt);

    // Very weak throws can stall before reaching pins
    if (Math.abs(this.vz) < 1.5) {
      this.active = false;
      this.reachedPins = false;
    }

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

export function calculatePinKnockdown(ballX, ballVx, ballPower, ballSpin, pinPositions, pinStanding) {
  const knocked = [];

  if (Math.abs(ballX) > GUTTER_THRESHOLD) {
    return knocked;
  }

  // Direct ball-to-pin collision — realistic contact distance
  const directHits = [];
  for (let i = 0; i < pinPositions.length; i++) {
    if (!pinStanding[i]) continue;
    const dx = Math.abs(ballX - pinPositions[i].x);
    if (dx < CONTACT_DIST) {
      directHits.push(i);
      knocked.push(i);
    }
  }

  if (directHits.length === 0) return knocked;

  // Pin-to-pin chain reactions with realistic physics
  // Scatter direction depends on which side the ball hit from
  const pinEnergy = {};
  for (const idx of directHits) {
    const hitOffset = ballX - pinPositions[idx].x;
    const hitStrength = ballPower * (1 - Math.abs(hitOffset) / CONTACT_DIST);
    pinEnergy[idx] = {
      strength: Math.max(0.1, hitStrength),
      dirX: hitOffset > 0 ? -1 : 1,
    };
  }

  // Chain up to 3 iterations, energy decays each time
  const PIN_CHAIN_DIST = 0.34;
  for (let iter = 0; iter < 3; iter++) {
    const newKnocks = [];
    for (const ki of knocked) {
      const energy = pinEnergy[ki];
      if (!energy || energy.strength < 0.15) continue;

      for (let i = 0; i < pinPositions.length; i++) {
        if (!pinStanding[i] || knocked.includes(i) || newKnocks.includes(i)) continue;
        const dx = pinPositions[ki].x - pinPositions[i].x;
        const dz = pinPositions[ki].z - pinPositions[i].z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > PIN_CHAIN_DIST) continue;

        // Probability drops with distance and decreasing energy
        const distFactor = 1 - (dist / PIN_CHAIN_DIST);
        const prob = energy.strength * distFactor * 0.7;

        if (Math.random() < prob) {
          newKnocks.push(i);
          pinEnergy[i] = {
            strength: energy.strength * 0.5 * distFactor,
            dirX: dx > 0 ? -1 : 1,
          };
        }
      }
    }
    if (newKnocks.length === 0) break;
    knocked.push(...newKnocks);
  }

  return [...new Set(knocked)];
}
