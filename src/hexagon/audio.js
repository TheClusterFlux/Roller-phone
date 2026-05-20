export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.buffer = null;
    this.startTime = 0;
    this.playing = false;
    this._freqData = null;
  }

  async load(url) {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const response = await fetch(url);
    const arrayBuf = await response.arrayBuffer();
    this.buffer = await this.ctx.decodeAudioData(arrayBuf);
    return this.buffer;
  }

  play() {
    if (!this.buffer || !this.ctx) return;
    this.stop();

    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this._freqData = new Uint8Array(this.analyser.frequencyBinCount);

    this.source.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.source.start(0);
    this.startTime = this.ctx.currentTime;
    this.playing = true;

    this.source.onended = () => { this.playing = false; };
  }

  stop() {
    if (this.source) {
      try { this.source.stop(); } catch (e) { /* already stopped */ }
      this.source = null;
    }
    this.playing = false;
  }

  get currentTime() {
    if (!this.ctx || !this.playing) return 0;
    return this.ctx.currentTime - this.startTime;
  }

  getEnergy() {
    if (!this.analyser || !this._freqData) return 0;
    this.analyser.getByteFrequencyData(this._freqData);
    let sum = 0;
    for (let i = 0; i < this._freqData.length; i++) {
      sum += this._freqData[i];
    }
    return sum / (this._freqData.length * 255);
  }

  getBassEnergy() {
    if (!this.analyser || !this._freqData) return 0;
    this.analyser.getByteFrequencyData(this._freqData);
    let sum = 0;
    const bassEnd = Math.floor(this._freqData.length * 0.15);
    for (let i = 0; i < bassEnd; i++) {
      sum += this._freqData[i];
    }
    return sum / (bassEnd * 255);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
}

export function generateBeatMap(buffer, bpm) {
  const sampleRate = buffer.sampleRate;
  const rawData = buffer.getChannelData(0);
  const duration = buffer.duration;

  const beatInterval = 60 / bpm;
  const walls = [];
  const samplesPerBeat = Math.floor(sampleRate * beatInterval);

  let beatTime = 0;
  let beatIndex = 0;
  let lastGap = 0;

  // Gentle intro: skip first 4 beats
  const introBeats = 4;

  while (beatTime < duration - 0.5) {
    const sampleStart = Math.floor(beatTime * sampleRate);
    const sampleEnd = Math.min(sampleStart + samplesPerBeat, rawData.length);

    let rms = 0;
    for (let i = sampleStart; i < sampleEnd; i++) {
      rms += rawData[i] * rawData[i];
    }
    rms = Math.sqrt(rms / (sampleEnd - sampleStart));

    let peak = 0;
    for (let i = sampleStart; i < sampleEnd; i++) {
      const abs = Math.abs(rawData[i]);
      if (abs > peak) peak = abs;
    }

    const energy = Math.min(1, rms * 4);
    const intensity = Math.min(1, peak * 2);

    if (beatIndex >= introBeats && energy > 0.05) {
      // Difficulty ramps over the song: first 30s easier, then harder
      const progress = Math.min(1, beatTime / 60);

      // Gap size: starts generous (3 sides), narrows to 2 over time
      const minGap = 2.0 - progress * 0.5;
      const gapSize = Math.max(minGap, 3.0 - energy * 1.5 - progress * 0.5);

      // Gap position: at most 2 sides away from previous gap so it's always reachable
      const maxJump = Math.min(3, Math.floor(1 + progress * 2));
      const direction = beatIndex % 2 === 0 ? 1 : -1;
      const jump = 1 + Math.floor(energy * maxJump);
      const gapPosition = ((lastGap + direction * jump) % 6 + 6) % 6;
      lastGap = gapPosition;

      walls.push({
        time: beatTime,
        distance: 1.0,
        gapStart: gapPosition,
        gapSize: gapSize,
        sides: 6,
        energy: energy,
      });

      // Extra half-beat walls only after 20s, and gap must be adjacent to main gap
      if (intensity > 0.7 && beatTime > 20 && beatTime + beatInterval / 2 < duration) {
        const gap2 = ((gapPosition + (Math.random() > 0.5 ? 1 : -1)) % 6 + 6) % 6;
        walls.push({
          time: beatTime + beatInterval / 2,
          distance: 1.0,
          gapStart: gap2,
          gapSize: Math.max(minGap, gapSize - 0.3),
          sides: 6,
          energy: intensity,
        });
        lastGap = gap2;
      }

      // Skip every other beat early on to keep things slow
      if (beatTime < 15 && beatIndex % 2 === 0) {
        beatTime += beatInterval;
        beatIndex++;
      }
    }

    beatTime += beatInterval;
    beatIndex++;
  }

  return { walls, bpm, duration };
}
