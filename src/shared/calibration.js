export class Calibrator {
  constructor(gyroManager) {
    this.gyro = gyroManager;
    this.baseline = null;
    this._samples = [];
  }

  async calibrate(durationMs = 1000) {
    this._samples = [];
    const interval = 16;
    const totalSamples = Math.floor(durationMs / interval);

    return new Promise((resolve) => {
      let count = 0;
      const timer = setInterval(() => {
        this._samples.push({
          ax: this.gyro.acceleration.x,
          ay: this.gyro.acceleration.y,
          az: this.gyro.acceleration.z,
        });
        count++;
        if (count >= totalSamples) {
          clearInterval(timer);
          this._computeBaseline();
          resolve(this.baseline);
        }
      }, interval);
    });
  }

  _computeBaseline() {
    if (this._samples.length === 0) {
      this.baseline = { ax: 0, ay: 0, az: 0 };
      return;
    }
    const sum = this._samples.reduce(
      (acc, s) => ({ ax: acc.ax + s.ax, ay: acc.ay + s.ay, az: acc.az + s.az }),
      { ax: 0, ay: 0, az: 0 }
    );
    const n = this._samples.length;
    this.baseline = {
      ax: sum.ax / n,
      ay: sum.ay / n,
      az: sum.az / n,
    };
  }

  getCorrected() {
    if (!this.baseline) return this.gyro.acceleration;
    const raw = this.gyro.acceleration;
    return {
      x: raw.x - this.baseline.ax,
      y: raw.y - this.baseline.ay,
      z: raw.z - this.baseline.az,
    };
  }
}
