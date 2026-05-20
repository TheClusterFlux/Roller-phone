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

  // Analyze energy at each beat to determine wall difficulty
  let beatTime = 0;
  let beatIndex = 0;

  while (beatTime < duration - 0.5) {
    const sampleStart = Math.floor(beatTime * sampleRate);
    const sampleEnd = Math.min(sampleStart + samplesPerBeat, rawData.length);

    // RMS energy for this beat window
    let rms = 0;
    for (let i = sampleStart; i < sampleEnd; i++) {
      rms += rawData[i] * rawData[i];
    }
    rms = Math.sqrt(rms / (sampleEnd - sampleStart));

    // Peak detection in this window
    let peak = 0;
    for (let i = sampleStart; i < sampleEnd; i++) {
      const abs = Math.abs(rawData[i]);
      if (abs > peak) peak = abs;
    }

    const energy = Math.min(1, rms * 4);
    const intensity = Math.min(1, peak * 2);

    // Generate wall pattern based on energy
    if (energy > 0.05) {
      const gapSize = mapRange(energy, 0.05, 0.8, 2.5, 1.0);
      const gapPosition = selectGapPosition(beatIndex, energy, intensity);
      const sides = energy > 0.5 ? 6 : 6;

      walls.push({
        time: beatTime,
        distance: 1.0,
        gapStart: gapPosition,
        gapSize: gapSize,
        sides: sides,
        energy: energy,
      });

      // High-energy beats get a second wall half a beat later
      if (intensity > 0.6 && beatTime + beatInterval / 2 < duration) {
        const gap2 = (gapPosition + 3 + Math.floor(Math.random() * 2)) % 6;
        walls.push({
          time: beatTime + beatInterval / 2,
          distance: 1.0,
          gapStart: gap2,
          gapSize: Math.max(1.0, gapSize - 0.3),
          sides: sides,
          energy: intensity,
        });
      }
    }

    beatTime += beatInterval;
    beatIndex++;
  }

  return { walls, bpm, duration };
}

function selectGapPosition(beatIndex, energy, intensity) {
  // Create patterns that flow naturally — avoid pure randomness
  const base = beatIndex % 6;
  const offset = Math.floor(energy * 3);
  if (intensity > 0.7) {
    return (base + 3) % 6; // Opposite side on intense beats
  }
  return (base + offset) % 6;
}

function mapRange(value, inMin, inMax, outMin, outMax) {
  const clamped = Math.max(inMin, Math.min(inMax, value));
  return outMin + (clamped - inMin) / (inMax - inMin) * (outMax - outMin);
}
