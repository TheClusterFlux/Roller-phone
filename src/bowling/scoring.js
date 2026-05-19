export class ScoringEngine {
  constructor() {
    this.reset();
  }

  reset() {
    // Each frame: { rolls: [pinsKnocked, ...], totalPins: number }
    this.frames = [];
    this.currentFrame = 0;
    this.currentRoll = 0;
    this.gameOver = false;
  }

  get frameNumber() {
    return this.currentFrame + 1;
  }

  get rollInFrame() {
    return this.currentRoll;
  }

  recordRoll(pinsKnocked) {
    if (this.gameOver) return;

    if (!this.frames[this.currentFrame]) {
      this.frames[this.currentFrame] = { rolls: [], totalPins: 0 };
    }

    const frame = this.frames[this.currentFrame];
    frame.rolls.push(pinsKnocked);
    frame.totalPins += pinsKnocked;
    this.currentRoll++;

    if (this.currentFrame < 9) {
      if (pinsKnocked === 10 || this.currentRoll >= 2) {
        this.currentFrame++;
        this.currentRoll = 0;
      }
    } else {
      // 10th frame
      if (frame.rolls.length === 1 && pinsKnocked === 10) {
        // Strike in 10th, get 2 more rolls
      } else if (frame.rolls.length === 2) {
        if (frame.totalPins >= 10) {
          // Spare or double strike, get one more roll
        } else {
          this.gameOver = true;
        }
      } else if (frame.rolls.length >= 3) {
        this.gameOver = true;
      }
    }
  }

  isStrike() {
    const frame = this.frames[this.currentFrame];
    return frame && frame.rolls.length === 1 && frame.rolls[0] === 10;
  }

  isSpare() {
    const frame = this.frames[this.currentFrame];
    return frame && frame.rolls.length === 2 && frame.totalPins === 10;
  }

  needsSecondRoll() {
    if (this.gameOver) return false;
    if (this.currentFrame < 9) {
      return this.currentRoll === 1;
    }
    // 10th frame
    const frame = this.frames[9];
    if (!frame) return false;
    if (frame.rolls.length === 1 && frame.rolls[0] < 10) return true;
    if (frame.rolls.length === 2 && frame.totalPins < 10) return false;
    return false;
  }

  needsReset() {
    if (this.currentFrame < 9) return false;
    const frame = this.frames[9];
    if (!frame) return true;
    // Reset pins if strike or spare in 10th frame for bonus rolls
    if (frame.rolls.length === 1 && frame.rolls[0] === 10) return true;
    if (frame.rolls.length === 2 && frame.totalPins === 10) return true;
    if (frame.rolls.length === 2 && frame.rolls[1] === 10) return true;
    return false;
  }

  getTotalScore() {
    let total = 0;
    const allRolls = [];
    for (const f of this.frames) {
      if (f) allRolls.push(...f.rolls);
    }

    let rollIdx = 0;
    for (let f = 0; f < Math.min(10, this.frames.length); f++) {
      if (f >= 10) break;
      const frame = this.frames[f];
      if (!frame) break;

      if (f < 9) {
        if (frame.rolls[0] === 10) {
          // Strike
          total += 10 + (allRolls[rollIdx + 1] || 0) + (allRolls[rollIdx + 2] || 0);
          rollIdx += 1;
        } else if (frame.totalPins === 10) {
          // Spare
          total += 10 + (allRolls[rollIdx + 2] || 0);
          rollIdx += 2;
        } else {
          total += frame.totalPins;
          rollIdx += 2;
        }
      } else {
        // 10th frame: just sum the rolls
        total += frame.rolls.reduce((a, b) => a + b, 0);
      }
    }
    return total;
  }

  getFrameScores() {
    const scores = [];
    const allRolls = [];
    for (const f of this.frames) {
      if (f) allRolls.push(...f.rolls);
    }

    let rollIdx = 0;
    let cumulative = 0;

    for (let f = 0; f < Math.min(10, this.frames.length); f++) {
      const frame = this.frames[f];
      if (!frame) break;

      let frameScore = null;

      if (f < 9) {
        if (frame.rolls[0] === 10) {
          if (allRolls[rollIdx + 1] !== undefined && allRolls[rollIdx + 2] !== undefined) {
            frameScore = 10 + allRolls[rollIdx + 1] + allRolls[rollIdx + 2];
          }
          rollIdx += 1;
        } else if (frame.totalPins === 10) {
          if (allRolls[rollIdx + 2] !== undefined) {
            frameScore = 10 + allRolls[rollIdx + 2];
          }
          rollIdx += 2;
        } else if (frame.rolls.length >= 2) {
          frameScore = frame.totalPins;
          rollIdx += 2;
        } else {
          rollIdx += frame.rolls.length;
        }
      } else {
        if (this.gameOver || frame.rolls.length >= 3 || (frame.rolls.length >= 2 && frame.totalPins < 10)) {
          frameScore = frame.rolls.reduce((a, b) => a + b, 0);
        }
      }

      if (frameScore !== null) {
        cumulative += frameScore;
        scores.push({ rolls: [...frame.rolls], total: cumulative, isStrike: frame.rolls[0] === 10, isSpare: frame.rolls.length >= 2 && frame.totalPins === 10 && frame.rolls[0] !== 10 });
      } else {
        scores.push({ rolls: [...frame.rolls], total: null, isStrike: false, isSpare: false });
      }
    }

    return scores;
  }

  getRollNotation(pins, rollInFrame, isTenthFrame) {
    if (pins === 10) return 'X';
    if (pins === 0) return '-';
    return String(pins);
  }
}
