import { BowlingScene, LANE_WIDTH, LANE_LENGTH, PIN_SPACING } from './scene.js';
import { BallPhysics, calculatePinKnockdown } from './physics.js';
import { BowlingControls } from './controls.js';
import { ScoringEngine } from './scoring.js';
import { haptics } from '../shared/haptics.js';
import { hasSensorSupport, requestMotionPermission, needsPermissionRequest } from '../shared/permissions.js';

const State = {
  LOADING: 'loading',
  POSITION: 'position',
  CALIBRATING: 'calibrating',
  SWING: 'swing',
  ROLLING: 'rolling',
  PIN_FALL: 'pin_fall',
  RESULT: 'result',
  GAME_OVER: 'game_over',
};

class BowlingGame {
  constructor() {
    this.canvas = document.getElementById('bowling-canvas');
    this.scene = new BowlingScene(this.canvas);
    this.ballPhysics = new BallPhysics();
    this.controls = new BowlingControls();
    this.scoring = new ScoringEngine();

    this.state = State.LOADING;
    this.hasSensors = hasSensorSupport();
    this.lastTime = 0;
    this.rollResult = null;

    this._cacheDOM();
    this._bindEvents();
    this._init();
  }

  _cacheDOM() {
    this.els = {
      frameNum: document.getElementById('frame-num'),
      scoreVal: document.getElementById('score-val'),
      positionControls: document.getElementById('position-controls'),
      positionSlider: document.getElementById('position-slider'),
      readyBtn: document.getElementById('ready-btn'),
      releaseControls: document.getElementById('release-controls'),
      releaseBtn: document.getElementById('release-btn'),
      resultControls: document.getElementById('result-controls'),
      resultText: document.getElementById('result-text'),
      nextBtn: document.getElementById('next-btn'),
      gameoverControls: document.getElementById('gameover-controls'),
      finalScoreText: document.getElementById('final-score-text'),
      replayBtn: document.getElementById('replay-btn'),
      centerMessage: document.getElementById('center-message'),
      powerContainer: document.getElementById('power-meter-container'),
      powerFill: document.getElementById('power-fill'),
      scorecard: document.getElementById('scorecard'),
      scorecardTable: document.getElementById('scorecard-table'),
    };
  }

  _bindEvents() {
    this.els.positionSlider.addEventListener('input', () => {
      if (this.state === State.POSITION) {
        const val = parseFloat(this.els.positionSlider.value);
        const halfLane = LANE_WIDTH / 2 - 0.12;
        this.scene.setBallPosition(val * halfLane);
      }
    });

    this.els.readyBtn.addEventListener('click', () => {
      if (this.state === State.POSITION) {
        this._enterCalibrating();
      }
    });

    this.els.releaseBtn.addEventListener('click', () => {
      if (this.state === State.SWING) {
        this._doRelease();
      }
    });

    this.els.nextBtn.addEventListener('click', () => {
      if (this.state === State.RESULT) {
        this._nextRoll();
      }
    });

    this.els.replayBtn.addEventListener('click', () => {
      this._resetGame();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === State.SWING) {
        this.controls.endSwingPhase();
      }
    });
  }

  async _init() {
    if (this.hasSensors && needsPermissionRequest()) {
      const granted = await requestMotionPermission();
      if (!granted) {
        this.hasSensors = false;
      }
    }

    if (this.hasSensors) {
      this.controls.start();
    }

    this._enterPosition();
    this._loop(0);
  }

  _hideAll() {
    this.els.positionControls.classList.add('hidden');
    this.els.releaseControls.classList.add('hidden');
    this.els.resultControls.classList.add('hidden');
    this.els.gameoverControls.classList.add('hidden');
    this.els.centerMessage.classList.add('hidden');
    this.els.powerContainer.classList.add('hidden');
  }

  _showMessage(text) {
    this.els.centerMessage.textContent = text;
    this.els.centerMessage.classList.remove('hidden');
    this.els.centerMessage.className = '';
  }

  _updateHUD() {
    this.els.frameNum.textContent = this.scoring.frameNumber;
    this.els.scoreVal.textContent = this.scoring.getTotalScore();
    this._renderScorecard();
  }

  _renderScorecard() {
    const scores = this.scoring.getFrameScores();
    if (scores.length === 0) {
      this.els.scorecard.classList.add('hidden');
      return;
    }
    this.els.scorecard.classList.remove('hidden');

    let headerRow = '<tr>';
    let rollRow = '<tr>';
    let totalRow = '<tr>';

    for (let f = 0; f < 10; f++) {
      headerRow += `<th>${f + 1}</th>`;
      const fs = scores[f];
      if (!fs) {
        rollRow += '<td></td>';
        totalRow += '<td></td>';
        continue;
      }

      let rollText = '';
      if (f < 9) {
        if (fs.isStrike) {
          rollText = 'X';
        } else if (fs.isSpare) {
          rollText = `${fs.rolls[0]} /`;
        } else {
          rollText = fs.rolls.map(r => r === 0 ? '-' : r).join(' ');
        }
      } else {
        rollText = fs.rolls.map((r, i) => {
          if (r === 10) return 'X';
          if (i > 0 && fs.rolls[i - 1] + r === 10 && fs.rolls[i - 1] !== 10) return '/';
          if (r === 0) return '-';
          return String(r);
        }).join(' ');
      }

      rollRow += `<td>${rollText}</td>`;
      totalRow += `<td>${fs.total !== null ? fs.total : ''}</td>`;
    }

    headerRow += '</tr>';
    rollRow += '</tr>';
    totalRow += '</tr>';

    this.els.scorecardTable.innerHTML = headerRow + rollRow + totalRow;
  }

  _enterPosition() {
    this._hideAll();
    this.state = State.POSITION;
    this.scene.resetCamera();
    this.scene.resetBall();

    if (this.scoring.currentRoll === 0) {
      this.els.positionSlider.value = 0;
      this.scene.setBallPosition(0);
    }

    this.els.positionControls.classList.remove('hidden');
    this._updateHUD();
  }

  async _enterCalibrating() {
    this._hideAll();
    this.state = State.CALIBRATING;
    this._showMessage('Hold still...');

    if (this.hasSensors) {
      await this.controls.calibrate(1000);
    } else {
      await new Promise(r => setTimeout(r, 800));
    }

    this._enterSwing();
  }

  _enterSwing() {
    this._hideAll();
    this.state = State.SWING;
    this.els.releaseControls.classList.remove('hidden');
    this.els.powerContainer.classList.remove('hidden');
    this.els.releaseBtn.classList.remove('active');

    if (this.hasSensors) {
      this.controls.beginSwingPhase();
      this._showMessage('Swing & tap RELEASE!');
    } else {
      this.els.releaseBtn.classList.add('active');
      this._showMessage('Tap RELEASE to bowl!');
    }

    this._swingTimeout = setTimeout(() => {
      if (this.state === State.SWING) {
        this._showMessage('Swing your phone forward,\nthen tap RELEASE!');
      }
    }, 6000);
  }

  _doRelease() {
    if (this.state !== State.SWING) return;
    clearTimeout(this._swingTimeout);
    haptics.release();

    let params;
    if (this.hasSensors) {
      params = this.controls.captureRelease();
    } else {
      params = this.controls.captureDesktopRelease();
    }

    this.controls.endSwingPhase();
    this._launchBall(params);
  }

  _launchBall(params) {
    this._hideAll();
    this.state = State.ROLLING;

    const startX = this.scene.getBallPosition().x;
    this.ballPhysics.launch(startX, params.power, params.angle, params.spin);

    this.rollResult = params;
    this._ballStalled = false;
  }

  _onBallStalled() {
    this.state = State.PIN_FALL;
    this.scoring.recordRoll(0);
    this._updateHUD();
    this._pinFallTimer = 0;
    this._pinsKnockedThisRoll = 0;
  }

  _onBallReachedPins() {
    this.state = State.PIN_FALL;

    const ballX = this.ballPhysics.x;
    const pinPositions = this.scene.pinMeshes.map(p => ({
      x: p.userData.origPos.x,
      z: p.userData.origPos.z,
    }));

    const knocked = calculatePinKnockdown(
      ballX,
      this.ballPhysics.vx,
      this.rollResult.power,
      this.rollResult.spin,
      pinPositions,
      this.scene.pinStanding
    );

    this.scene.knockDownPins(knocked);

    const pinsKnocked = knocked.length;
    if (pinsKnocked > 0) {
      haptics.impact();
    }

    this.scoring.recordRoll(pinsKnocked);
    this._updateHUD();
    this._pinFallTimer = 0;
    this._pinsKnockedThisRoll = pinsKnocked;
  }

  _onPinFallComplete() {
    if (this.scoring.gameOver) {
      this._enterGameOver();
      return;
    }

    const wasStrike = this._pinsKnockedThisRoll === 10 && this.scoring.rollInFrame === 0;
    const wasSpare = this.scene.getStandingPinCount() === 0 && !wasStrike;
    const wasGutter = this._pinsKnockedThisRoll === 0;

    this._hideAll();
    this.state = State.RESULT;
    this.els.resultControls.classList.remove('hidden');

    const resultText = this.els.resultText;
    if (wasStrike) {
      resultText.textContent = 'STRIKE!';
      resultText.className = 'strike-anim';
      haptics.success();
    } else if (wasSpare) {
      resultText.textContent = 'SPARE!';
      resultText.className = 'spare-anim';
      haptics.success();
    } else if (wasGutter) {
      resultText.textContent = 'Gutter Ball';
      resultText.className = 'gutter-anim';
      haptics.error();
    } else {
      resultText.textContent = `${this._pinsKnockedThisRoll} pin${this._pinsKnockedThisRoll !== 1 ? 's' : ''}`;
      resultText.className = '';
    }
  }

  _nextRoll() {
    if (this.scoring.gameOver) {
      this._enterGameOver();
      return;
    }

    const needsSecond = this.scoring.needsSecondRoll();
    const needsReset = this.scoring.needsReset();

    if (needsReset) {
      this.scene.resetAllPins();
    } else if (needsSecond) {
      this.scene.resetForSpare();
    } else {
      this.scene.resetAllPins();
    }

    this._enterPosition();
  }

  _enterGameOver() {
    this._hideAll();
    this.state = State.GAME_OVER;
    this.els.gameoverControls.classList.remove('hidden');
    this.els.finalScoreText.textContent = `Final Score: ${this.scoring.getTotalScore()}`;
    this._updateHUD();
  }

  _resetGame() {
    this.scoring.reset();
    this.ballPhysics.reset();
    this.scene.resetAllPins();
    this.scene.resetBall();
    this.scene.resetCamera();
    this._enterPosition();
  }

  _loop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    if (this.state === State.SWING) {
      this.controls.update();
      const power = this.controls.swingPowerNormalized;
      this.els.powerFill.style.width = `${power * 100}%`;

      if (this.controls.isSwinging) {
        this.els.releaseBtn.classList.add('active');
        this.els.centerMessage.classList.add('hidden');
      }
    }

    if (this.state === State.ROLLING) {
      this.ballPhysics.update(dt);
      const pos = this.ballPhysics.getPosition();
      this.scene.ball.position.x = pos.x;
      this.scene.ball.position.z = pos.z;

      this.scene.ball.rotation.x -= dt * 15;
      this.scene.ball.rotation.z += this.ballPhysics.spin * dt * 3;

      this.scene.setCameraFollow(pos.x, pos.z);

      if (this.ballPhysics.reachedPins) {
        this._onBallReachedPins();
      } else if (!this.ballPhysics.active && !this.ballPhysics.reachedPins) {
        this._onBallStalled();
      }
    }

    if (this.state === State.PIN_FALL) {
      this._pinFallTimer += dt;
      const animating = this.scene.animatePinFall(dt);
      this.scene.setCameraPinView();

      if (!animating || this._pinFallTimer > 2) {
        this.scene.ball.visible = false;
        this._onPinFallComplete();
      }
    }

    this.scene.updateCamera(dt);
    this.scene.render();
    requestAnimationFrame((t) => this._loop(t));
  }
}

new BowlingGame();
