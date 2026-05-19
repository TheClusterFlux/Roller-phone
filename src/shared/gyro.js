const SMOOTHING = 0.3;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class GyroManager {
  constructor() {
    this._acceleration = { x: 0, y: 0, z: 0 };
    this._accelerationWithGravity = { x: 0, y: 0, z: 0 };
    this._rotationRate = { alpha: 0, beta: 0, gamma: 0 };
    this._orientation = { alpha: 0, beta: 0, gamma: 0 };
    this._active = false;
    this._motionHandler = null;
    this._orientationHandler = null;
    this._sampleCount = 0;
    this._lastTimestamp = 0;
  }

  start() {
    if (this._active) return;
    this._active = true;
    this._sampleCount = 0;

    this._motionHandler = (e) => {
      this._sampleCount++;
      this._lastTimestamp = performance.now();

      if (e.acceleration) {
        this._acceleration.x = lerp(this._acceleration.x, e.acceleration.x || 0, SMOOTHING);
        this._acceleration.y = lerp(this._acceleration.y, e.acceleration.y || 0, SMOOTHING);
        this._acceleration.z = lerp(this._acceleration.z, e.acceleration.z || 0, SMOOTHING);
      }
      if (e.accelerationIncludingGravity) {
        this._accelerationWithGravity.x = lerp(this._accelerationWithGravity.x, e.accelerationIncludingGravity.x || 0, SMOOTHING);
        this._accelerationWithGravity.y = lerp(this._accelerationWithGravity.y, e.accelerationIncludingGravity.y || 0, SMOOTHING);
        this._accelerationWithGravity.z = lerp(this._accelerationWithGravity.z, e.accelerationIncludingGravity.z || 0, SMOOTHING);
      }
      if (e.rotationRate) {
        this._rotationRate.alpha = lerp(this._rotationRate.alpha, e.rotationRate.alpha || 0, SMOOTHING);
        this._rotationRate.beta = lerp(this._rotationRate.beta, e.rotationRate.beta || 0, SMOOTHING);
        this._rotationRate.gamma = lerp(this._rotationRate.gamma, e.rotationRate.gamma || 0, SMOOTHING);
      }
    };

    this._orientationHandler = (e) => {
      this._orientation.alpha = e.alpha || 0;
      this._orientation.beta = e.beta || 0;
      this._orientation.gamma = e.gamma || 0;
    };

    window.addEventListener('devicemotion', this._motionHandler);
    window.addEventListener('deviceorientation', this._orientationHandler);
  }

  stop() {
    if (!this._active) return;
    this._active = false;
    if (this._motionHandler) {
      window.removeEventListener('devicemotion', this._motionHandler);
    }
    if (this._orientationHandler) {
      window.removeEventListener('deviceorientation', this._orientationHandler);
    }
  }

  get acceleration() {
    return { ...this._acceleration };
  }

  get accelerationWithGravity() {
    return { ...this._accelerationWithGravity };
  }

  get rotationRate() {
    return { ...this._rotationRate };
  }

  get orientation() {
    return { ...this._orientation };
  }

  get isActive() {
    return this._active;
  }

  get totalMagnitude() {
    const a = this._acceleration;
    return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  }

  reset() {
    this._acceleration = { x: 0, y: 0, z: 0 };
    this._accelerationWithGravity = { x: 0, y: 0, z: 0 };
    this._rotationRate = { alpha: 0, beta: 0, gamma: 0 };
    this._sampleCount = 0;
  }
}
