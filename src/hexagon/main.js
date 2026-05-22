import { HexRenderer } from './renderer.js';
import '../shared/version.js';
import { AudioEngine, generateBeatMap } from './audio.js';
import { requestMotionPermission, hasSensorSupport, needsPermissionRequest } from '../shared/permissions.js';
import { haptics } from '../shared/haptics.js';

const TAU = Math.PI * 2;
const HEX_RADIUS = 0.12;
const WALL_SPEED_BASE = 0.35;
const WALL_APPROACH = 1.3;

const SONGS = [
  { id: 'voltaic', name: 'Voltaic', artist: 'Kevin MacLeod', bpm: 120, file: '/music/voltaic.mp3' },
  { id: 'deep-haze', name: 'Deep Haze', artist: 'Kevin MacLeod', bpm: 120, file: '/music/deep-haze.mp3' },
  { id: 'hustle', name: 'Hustle', artist: 'Kevin MacLeod', bpm: 120, file: '/music/hustle.mp3' },
];

const State = { MENU: 0, LOADING: 1, CALIBRATING: 2, PLAYING: 3, DEAD: 4 };

class HexGame {
  constructor() {
    this.canvas = document.getElementById('hex-canvas');
    this.renderer = new HexRenderer(this.canvas);
    this.audio = new AudioEngine();

    this.state = State.MENU;
    this.selectedSong = null;
    this.beatMap = null;

    this.playerAngle = -TAU / 4;
    this.worldRotation = 0;
    this.touchRotation = 0;

    this.gyroCalibrated = false;
    this.gyroMode = 'flat';
    this.gyroOffset = 0;
    this.gyroAlpha = 0;
    this.gyroBeta = 0;
    this.gyroGamma = 0;
    this.gravityAngle = 0; // angle of "up" relative to screen top
    this.hasSensors = hasSensorSupport();

    this.activeWalls = [];
    this.time = 0;
    this.wallSpeed = WALL_SPEED_BASE;
    this.nextWallIndex = 0;
    this.lastBeatTime = 0;
    this.colorCycleTime = 0;
    this.lastFrameTime = 0;

    this._cacheDOM();
    this._bindEvents();
    this._buildSongList();
    this._initGyro();
    this._loop(0);
  }

  _cacheDOM() {
    this.els = {
      menu: document.getElementById('menu-screen'),
      songList: document.getElementById('song-list'),
      calibrateBtn: document.getElementById('calibrate-btn'),
      hud: document.getElementById('game-hud'),
      timeDisplay: document.getElementById('time-display'),
      songTitleDisplay: document.getElementById('song-title-display'),
      gameover: document.getElementById('gameover-screen'),
      goTime: document.getElementById('go-time'),
      retryBtn: document.getElementById('retry-btn'),
      menuBtn: document.getElementById('menu-btn'),
      calOverlay: document.getElementById('calibrate-overlay'),
    };
  }

  _bindEvents() {
    this.els.calibrateBtn.addEventListener('click', () => this._calibrate());
    this.els.retryBtn.addEventListener('click', () => this._startGame(this.selectedSong));
    this.els.menuBtn.addEventListener('click', () => this._showMenu());

    // Fallback touch controls for desktops / no gyro
    let touchActive = false;
    let touchStartX = 0;
    this.canvas.addEventListener('touchstart', (e) => {
      if (this.state !== State.PLAYING) return;
      touchActive = true;
      touchStartX = e.touches[0].clientX;
    });
    this.canvas.addEventListener('touchmove', (e) => {
      if (!touchActive || this.state !== State.PLAYING) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - touchStartX;
      touchStartX = e.touches[0].clientX;
      this.touchRotation += dx * 0.008;
    });
    this.canvas.addEventListener('touchend', () => { touchActive = false; });

    // Mouse fallback for desktop
    let mouseDown = false;
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.state !== State.PLAYING) return;
      mouseDown = true;
      touchStartX = e.clientX;
    });
    window.addEventListener('mousemove', (e) => {
      if (!mouseDown || this.state !== State.PLAYING) return;
      const dx = e.clientX - touchStartX;
      touchStartX = e.clientX;
      this.touchRotation += dx * 0.008;
    });
    window.addEventListener('mouseup', () => { mouseDown = false; });
  }

  _buildSongList() {
    this.els.songList.innerHTML = '';
    for (const song of SONGS) {
      const card = document.createElement('div');
      card.className = 'song-card';
      card.innerHTML = `
        <div class="song-icon">\uD83C\uDFB5</div>
        <div class="song-info">
          <div class="song-name">${song.name}</div>
          <div class="song-artist">${song.artist}</div>
        </div>
        <div class="song-bpm">${song.bpm} BPM</div>
      `;
      card.addEventListener('click', () => this._startGame(song));
      this.els.songList.appendChild(card);
    }
  }

  async _initGyro() {
    if (!this.hasSensors) return;

    if (needsPermissionRequest()) {
      const granted = await requestMotionPermission();
      if (!granted) {
        this.hasSensors = false;
        return;
      }
    }

    window.addEventListener('deviceorientation', (e) => {
      if (e.alpha !== null) this.gyroAlpha = e.alpha;
      if (e.beta !== null) this.gyroBeta = e.beta;
      if (e.gamma !== null) this.gyroGamma = e.gamma;
    });

    window.addEventListener('devicemotion', (e) => {
      const g = e.accelerationIncludingGravity;
      if (!g) return;
      // atan2(x, y) gives angle of gravity relative to screen-top
      // Negate to get "up" direction. Smoothed to reduce jitter.
      const raw = Math.atan2(-(g.x || 0), g.y || 0);
      this.gravityAngle = this.gravityAngle * 0.7 + raw * 0.3;
    });
  }

  async _calibrate() {
    this.els.calOverlay.classList.remove('hidden');
    this.audio.resume();

    await new Promise(r => setTimeout(r, 1200));

    // Detect phone orientation from beta:
    // beta ≈ 0°  → phone is flat on a surface → use alpha (compass heading)
    // beta ≈ 90° → phone is upright/vertical  → use gamma (steering tilt)
    const absBeta = Math.abs(this.gyroBeta);
    if (absBeta > 45) {
      this.gyroMode = 'vertical';
      this.gyroOffset = this.gravityAngle;
    } else {
      this.gyroMode = 'flat';
      this.gyroOffset = this.gyroAlpha;
    }

    this.gyroCalibrated = true;
    this.els.calOverlay.classList.add('hidden');
  }

  _getGyroRotation() {
    if (!this.hasSensors || !this.gyroCalibrated) return 0;

    if (this.gyroMode === 'vertical') {
      return this.gravityAngle - this.gyroOffset;
    }

    // Flat mode: alpha ranges 0 to 360
    let delta = this.gyroAlpha - this.gyroOffset;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return delta * (Math.PI / 180);
  }

  async _startGame(song) {
    this.selectedSong = song;
    this.state = State.LOADING;
    this.els.menu.classList.add('hidden');
    this.els.gameover.classList.add('hidden');

    this.audio.resume();

    try {
      const buffer = await this.audio.load(song.file);
      this.beatMap = generateBeatMap(buffer, song.bpm);
    } catch (err) {
      console.error('Failed to load song:', err);
      this._showMenu();
      return;
    }

    if (this.hasSensors) {
      await this._calibrate();
    }

    this.time = 0;
    this.activeWalls = [];
    this.nextWallIndex = 0;
    this.wallSpeed = WALL_SPEED_BASE;
    this.playerAngle = -TAU / 4;
    this.worldRotation = 0;
    this.touchRotation = 0;
    this.colorCycleTime = 0;
    this.renderer.setColorScheme(0);

    this.els.hud.classList.remove('hidden');
    this.els.songTitleDisplay.textContent = `${song.name} — ${song.artist}`;

    this.audio.play();
    this.state = State.PLAYING;
  }

  _showMenu() {
    this.audio.stop();
    this.state = State.MENU;
    this.els.menu.classList.remove('hidden');
    this.els.gameover.classList.add('hidden');
    this.els.hud.classList.add('hidden');
  }

  _die() {
    this.state = State.DEAD;
    this.audio.stop();
    haptics.error();

    this.els.hud.classList.add('hidden');
    this.els.gameover.classList.remove('hidden');
    this.els.goTime.textContent = `${this.time.toFixed(2)}s`;
  }

  _checkCollision() {
    // Player's angle relative to the (possibly rotated) wall coordinate system
    const relativeAngle = this.playerAngle - this.worldRotation;
    const playerNorm = ((relativeAngle % TAU) + TAU) % TAU;
    const sides = 6;
    const step = TAU / sides;

    for (const wall of this.activeWalls) {
      if (wall.normalizedDist > HEX_RADIUS + 0.04) continue;
      if (wall.normalizedDist < HEX_RADIUS - 0.02) continue;

      // Which side is the player on?
      const playerSide = Math.floor(playerNorm / step);
      const gapEnd = wall.gapStart + wall.gapSize;

      let inGap = false;
      if (gapEnd <= sides) {
        inGap = playerSide >= wall.gapStart && playerSide < gapEnd;
      } else {
        inGap = playerSide >= wall.gapStart || playerSide < (gapEnd % sides);
      }

      if (!inGap) {
        return true;
      }
    }
    return false;
  }

  _update(dt) {
    if (this.state !== State.PLAYING) return;

    this.time += dt;

    const gyro = (this.hasSensors && this.gyroCalibrated) ? this._getGyroRotation() : 0;
    const input = gyro + this.touchRotation;

    if (this.gyroMode === 'vertical') {
      // Steering wheel: world is locked to screen, triangle tracks gravity (always points up physically)
      // Tilt phone right → triangle drifts left on screen (stays pointing at ceiling)
      this.worldRotation = 0;
      this.playerAngle = -TAU / 4 - input;
    } else {
      // Compass: triangle moves based on compass heading, world stays still
      this.worldRotation = 0;
      this.playerAngle = -TAU / 4 + input;
    }

    // Speed ramp: gets faster over time
    this.wallSpeed = WALL_SPEED_BASE + this.time * 0.003;

    // Color cycling every 10 seconds
    const newColorTime = Math.floor(this.time / 10);
    if (newColorTime !== this.colorCycleTime) {
      this.colorCycleTime = newColorTime;
      this.renderer.setColorScheme(newColorTime);
    }

    // Spawn walls from beat map
    if (this.beatMap) {
      while (this.nextWallIndex < this.beatMap.walls.length) {
        const wallDef = this.beatMap.walls[this.nextWallIndex];
        // Spawn wall when its beat time is within approach window
        const spawnTime = wallDef.time - (WALL_APPROACH / this.wallSpeed);
        if (this.time >= spawnTime) {
          this.activeWalls.push({
            ...wallDef,
            normalizedDist: WALL_APPROACH,
          });
          this.nextWallIndex++;
          this.renderer.flash();
        } else {
          break;
        }
      }
    }

    // Move walls inward
    for (let i = this.activeWalls.length - 1; i >= 0; i--) {
      this.activeWalls[i].normalizedDist -= this.wallSpeed * dt;
      if (this.activeWalls[i].normalizedDist < -0.1) {
        this.activeWalls.splice(i, 1);
      }
    }

    // Collision check
    if (this._checkCollision()) {
      this._die();
      return;
    }

    // Update HUD
    this.els.timeDisplay.textContent = this.time.toFixed(2);

    // Check if song ended
    if (this.beatMap && this.time > this.beatMap.duration + 2) {
      this._die();
    }
  }

  _loop(timestamp) {
    const dt = Math.min((timestamp - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = timestamp;

    if (this.state === State.MENU) {
      this.renderer.renderMenu();
    } else if (this.state === State.PLAYING) {
      this._update(dt);

      const energy = this.audio.getEnergy();
      const bassEnergy = this.audio.getBassEnergy();

      this.renderer.render({
        worldRotation: this.worldRotation,
        playerAngle: this.playerAngle,
        walls: this.activeWalls,
        hexRadius: HEX_RADIUS,
        energy: bassEnergy,
        time: this.time,
      });
    } else if (this.state === State.DEAD) {
      this.renderer.render({
        worldRotation: this.worldRotation,
        playerAngle: this.playerAngle,
        walls: this.activeWalls,
        hexRadius: HEX_RADIUS,
        energy: 0,
        time: this.time,
      });
    }

    requestAnimationFrame((t) => this._loop(t));
  }
}

new HexGame();
