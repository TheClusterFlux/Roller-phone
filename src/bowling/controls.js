import { GyroManager } from '../shared/gyro.js';
import { Calibrator } from '../shared/calibration.js';

const SWING_MIN_ACCEL = 4;
const SWING_MAX_ACCEL = 30;
const SPIN_MIN_RATE = 15;
const SPIN_MAX_RATE = 200;
const LATERAL_MAX = 12;

export class BowlingControls {
  constructor() {
    this.gyro = new GyroManager();
    this.calibrator = new Calibrator(this.gyro);
    this._swingActive = false;
    this._peakAccel = 0;
    this._currentAccel = 0;
    this._inSwing = false;
  }

  start() {
    this.gyro.start();
  }

  stop() {
    this.gyro.stop();
  }

  async calibrate(durationMs = 1000) {
    return this.calibrator.calibrate(durationMs);
  }

  beginSwingPhase() {
    this._swingActive = true;
    this._peakAccel = 0;
    this._currentAccel = 0;
    this._inSwing = false;
  }

  endSwingPhase() {
    this._swingActive = false;
  }

  update() {
    if (!this._swingActive) return;

    const corrected = this.calibrator.getCorrected();
    const mag = Math.sqrt(corrected.x * corrected.x + corrected.y * corrected.y + corrected.z * corrected.z);
    this._currentAccel = mag;

    if (mag > SWING_MIN_ACCEL) {
      this._inSwing = true;
    }

    if (this._inSwing && mag > this._peakAccel) {
      this._peakAccel = mag;
    }
  }

  get isSwinging() {
    return this._inSwing;
  }

  get swingPowerNormalized() {
    const clamped = Math.max(0, Math.min(this._currentAccel, SWING_MAX_ACCEL));
    return clamped / SWING_MAX_ACCEL;
  }

  captureRelease() {
    const corrected = this.calibrator.getCorrected();
    const rawAccel = this.gyro.acceleration;
    const rotRate = this.gyro.rotationRate;

    const forwardAccel = Math.sqrt(corrected.x * corrected.x + corrected.y * corrected.y + corrected.z * corrected.z);

    // Power: normalized from current acceleration
    const power = Math.max(0, Math.min(1,
      (forwardAccel - SWING_MIN_ACCEL) / (SWING_MAX_ACCEL - SWING_MIN_ACCEL)
    ));

    // Release timing quality: how close current accel is to peak
    const timingRatio = this._peakAccel > 0 ? forwardAccel / this._peakAccel : 0.5;
    const timingBonus = Math.max(0, Math.min(1, timingRatio));

    // Angle: from lateral acceleration
    const lateralAccel = rawAccel.x || 0;
    const angle = (lateralAccel / LATERAL_MAX) * 25;

    // Spin: from rotation rate
    const rotMag = Math.abs(rotRate.gamma || 0);
    const spinDir = Math.sign(rotRate.gamma || 0);
    const spinAmount = Math.min(1, (rotMag - SPIN_MIN_RATE) / (SPIN_MAX_RATE - SPIN_MIN_RATE));
    const spin = spinDir * Math.max(0, spinAmount);

    const finalPower = power * (0.5 + timingBonus * 0.5);

    return {
      power: finalPower,
      angle: angle,
      spin: spin,
      timingQuality: timingBonus,
      rawPower: power,
    };
  }

  captureDesktopRelease() {
    return {
      power: 0.5 + Math.random() * 0.4,
      angle: (Math.random() - 0.5) * 8,
      spin: (Math.random() - 0.5) * 0.4,
      timingQuality: 0.7 + Math.random() * 0.3,
      rawPower: 0.6,
    };
  }
}
