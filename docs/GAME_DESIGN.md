# Bowling Game — Game Design Document

The first game in the Roller Phone collection. A gyroscope-controlled bowling game where you physically swing your phone to roll a ball down a lane.

---

## Table of Contents

1. [Core Concept](#core-concept)
2. [Player Flow](#player-flow)
3. [Controls & Gyroscope Mapping](#controls--gyroscope-mapping)
4. [The Bowling Physics Model](#the-bowling-physics-model)
5. [3D Scene Design](#3d-scene-design)
6. [UI / HUD](#ui--hud)
7. [Scoring](#scoring)
8. [Sound & Haptics](#sound--haptics)
9. [Edge Cases & Error Handling](#edge-cases--error-handling)
10. [Implementation Plan](#implementation-plan)

---

## Core Concept

The player sees a bowling lane on their phone screen. They adjust their starting position by dragging left/right, then physically swing their phone in a bowling motion to roll the ball. The phone's accelerometer detects the swing speed and release angle, translating it into ball velocity and spin.

**Key feel goals:**
- The throw should feel **physical and satisfying** — speed matters, angle matters
- Casual enough for anyone to pick up in 10 seconds
- Rewarding enough that chasing a perfect game (300) keeps you playing

---

## Player Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     BOWLING GAME FLOW                        │
│                                                              │
│  ┌──────────┐                                                │
│  │  ENTER   │  Player arrives from hub                       │
│  │  GAME    │  Assets load, Three.js scene initializes       │
│  └────┬─────┘                                                │
│       ▼                                                      │
│  ┌──────────┐                                                │
│  │ TUTORIAL │  First-time only: brief animation showing      │
│  │ (once)   │  how to hold + swing the phone                 │
│  └────┬─────┘                                                │
│       ▼                                                      │
│  ┌──────────┐                                                │
│  │ POSITION │  Player drags left/right to choose lane        │
│  │ SELECT   │  position. "Ready" button visible.             │
│  └────┬─────┘                                                │
│       ▼  (tap "Ready")                                       │
│  ┌──────────┐                                                │
│  │CALIBRATE │  "Hold your phone still..."                    │
│  │ (1-2s)   │  Samples gyro to establish zero-point          │
│  └────┬─────┘                                                │
│       ▼                                                      │
│  ┌──────────┐                                                │
│  │  SWING   │  "Swing when ready!"                           │
│  │  DETECT  │  Listens for bowling swing gesture             │
│  └────┬─────┘                                                │
│       ▼  (swing detected)                                    │
│  ┌──────────┐                                                │
│  │  BALL    │  Ball rolls down lane with calculated          │
│  │  ROLL    │  velocity, spin, and angle                     │
│  └────┬─────┘                                                │
│       ▼                                                      │
│  ┌──────────┐                                                │
│  │   PIN    │  Pins react, knocked pins animate              │
│  │  IMPACT  │  Score calculated                              │
│  └────┬─────┘                                                │
│       ▼                                                      │
│  ┌──────────┐                                                │
│  │  RESULT  │  Show pins knocked down, running score         │
│  │  SCREEN  │  "Bowl Again" or auto-advance to next frame    │
│  └────┬─────┘                                                │
│       │                                                      │
│       ▼                                                      │
│  Frame < 10? ──yes──▶ Back to POSITION SELECT                │
│       │                                                      │
│       no (game over)                                         │
│       ▼                                                      │
│  ┌──────────┐                                                │
│  │  FINAL   │  Final score, strike/spare stats               │
│  │  SCORE   │  "Play Again" / "Back to Hub"                  │
│  └──────────┘                                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Controls & Gyroscope Mapping

### Phone Orientation During Play

The player holds their phone **like a TV remote / bowling ball in hand** — screen facing up or slightly tilted toward them, gripped firmly.

```
  Bowling swing motion (side view):

       ╭─────╮
       │Phone│  ← Back-swing (arm goes back)
       ╰──┬──╯
          │
          │  (arm swings forward)
          │
          ▼
       ╭─────╮
       │Phone│  ← Release point (arm extends forward)
       ╰─────╯
          │
          ▼
     Ball rolls!
```

### Sensor Data Used

| Sensor | Data | What It Maps To |
|--------|------|-----------------|
| `DeviceMotion.acceleration` | Linear acceleration (m/s²) | **Swing speed** → ball velocity |
| `DeviceMotion.accelerationIncludingGravity` | Total acceleration | **Release detection** (deceleration spike) |
| `DeviceMotion.rotationRate` | Angular velocity (deg/s) | **Spin/curve** on the ball |
| `DeviceOrientation.gamma` | Left/right tilt (deg) | **Throw angle** (left/right aim) |

### Swing Detection Algorithm

The core of the gameplay. Must reliably detect a bowling swing and extract meaningful parameters.

**Phase 1: Idle / Waiting**
- Player is holding phone still (post-calibration)
- Monitor `acceleration.z` (forward/back axis relative to the phone)
- Threshold: absolute acceleration < 2 m/s² = still idle

**Phase 2: Wind-up Detection**
- `acceleration.z` goes **negative** (phone moving backward)
- Magnitude exceeds threshold (> 3 m/s²)
- Mark: wind-up has started
- Start recording acceleration samples

**Phase 3: Forward Swing**
- `acceleration.z` flips to **positive** (phone moving forward)
- This is the main power phase
- Track peak acceleration: this determines ball speed

**Phase 4: Release Detection**
- Sharp **deceleration** (acceleration drops rapidly)
- OR angular change suggests the wrist has "released"
- The moment of release captures:
  - **Peak forward acceleration** → ball speed
  - **Lateral acceleration** (`acceleration.x`) → left/right deviation
  - **Rotation rate** (`rotationRate.alpha` or `.gamma`) → ball spin/curve

**Swing Parameters Extracted:**

```js
{
  power: 0.0 - 1.0,        // Normalized from peak acceleration
  angle: -30 to +30,       // Degrees off-center (from lateral accel + orientation)
  spin: -1.0 to +1.0,      // Curve amount (from rotation rate at release)
  releaseHeight: 0.0 - 1.0 // How "clean" the release was
}
```

### Sensitivity & Tuning

These values need extensive playtesting to get right. Plan for a debug overlay during development that shows raw sensor values and computed swing parameters.

| Parameter | Min Threshold | Max Cap | Notes |
|-----------|--------------|---------|-------|
| Forward accel (power) | 5 m/s² | 30 m/s² | Below min = too slow, above max = same max power |
| Lateral accel (angle) | 1 m/s² | 15 m/s² | Small lateral movements = straight throw |
| Rotation rate (spin) | 20 deg/s | 200 deg/s | Wrist rotation at release |

### Accidental Throw Prevention

A common problem with motion-controlled games. Solutions:

1. **Require "Ready" state**: Player must tap "Ready" before the game listens for swings
2. **Wind-up requirement**: Must detect a backward motion before accepting a forward swing
3. **Minimum swing duration**: The full swing (wind-up → release) must take at least 300ms
4. **Cooldown**: After a throw, 2-second cooldown before next throw can register

---

## The Bowling Physics Model

### Simplification Strategy

Real bowling physics are extraordinarily complex (oil patterns, ball core dynamics, pin deflection angles). We simplify to what *feels* right, not what's physically accurate.

### Ball Motion

The ball's path is a **curve** defined by:

```
Ball trajectory (top-down view of lane):

  Foul Line                              Pins
     │                                    │
     │    ╭───── Curve from spin          │
     │   ╱                                │
     │  ╱                                 │
     │ ╱                                  │
     │╱                                   │
     ●  ← Starting position              △△△△
     │    (player-selected)             △△△△△△
     │                                    │
```

**Ball parameters:**
- `position.x`: Starting lateral position (from player selection, -1 to +1)
- `velocity`: Forward speed (mapped from swing power)
- `angle`: Initial direction offset (from swing angle)
- `spin`: Curve amount (from wrist rotation at release)

**Ball path calculation:**
1. Ball starts at selected position
2. Moves forward at `velocity` (constant, no friction for simplicity)
3. Lateral movement = `sin(angle) * velocity + spin * curveFunction(distance)`
4. Spin effect increases over distance (like real bowling — ball hooks more as it travels)

### Pin Physics

10 pins in standard triangle formation.

```
Pin layout (looking down the lane):

    7  8  9  10       ← Back row
      4  5  6         ← Third row
        2  3          ← Second row
          1           ← Head pin (closest)
```

**Pin collision model (simplified):**
- Each pin is a cylinder with a center point and radius
- Ball-to-pin: If ball path intersects pin radius → pin is hit
- Pin-to-pin: Knocked pins can knock over adjacent pins within a scatter radius
- **Pin scatter**: When hit, a pin falls in the direction of the impact vector + some randomness
- Chain reactions: Use a simple iterative check (knocked pin → check neighbors → repeat up to 3 iterations)

**Why not a full physics engine?**
- A real physics engine (Cannon.js, Ammo.js) adds 100-300KB and complexity
- For a casual mobile game, "feels right" > "physically accurate"
- Simplified collision is much cheaper on mobile CPUs
- If the simplified model doesn't feel good enough during development, we can upgrade to Cannon.js later

### Scoring Impact Mapping

How swing quality affects results:

| Swing | Result |
|-------|--------|
| High power, straight, center position | Strike candidate |
| Medium power, slight angle | Hits pocket (1-3 or 1-2), good pin action |
| Low power | Ball may not reach pins or lacks energy for chain reactions |
| Heavy spin + angle | Big hook — can be very effective or gutter |
| Extreme angle | Gutter ball |

---

## 3D Scene Design

### Camera

- **Fixed perspective camera** looking down the lane from behind the foul line
- Slight elevation angle (like a TV bowling broadcast view)
- Camera does NOT move with the ball (too disorienting on mobile)
- Optional: slow zoom toward pins after release (cinematic feel)

### Lane

- Standard bowling lane proportions (60ft long × ~3.5ft wide, scaled for visual appeal)
- Simple textured plane (wood texture)
- Gutters on both sides (darker channels)
- Foul line marked clearly
- Lane arrows/dots for aiming reference (like real lanes)

### Ball

- Sphere with a subtle texture/color
- Player can choose ball color (stretch goal)
- Rolling animation (rotate based on velocity)
- Subtle shadow beneath

### Pins

- Low-poly pin models (cylinder + neck + head, ~200 polygons each)
- White with red stripe
- 10 pins in triangle formation
- When hit: rotation + translation animation, then settle
- Reset animation between frames (pins slide back up)

### Lighting

- Ambient light (soft fill)
- Directional light from above (lane illumination)
- Subtle spot light on pin area (draw eye to target)
- No dynamic shadows on mobile (too expensive) — use baked shadow textures or simple circles under pins

### Visual Effects

- Ball trail: subtle line or glow showing the path
- Pin impact: brief particle burst (small white circles)
- Strike: celebratory effect (screen flash, floating text, particles)
- Gutter: sad trombone visual (dimming, subtle)

### Performance Considerations

- Total triangle count target: < 5,000 for entire scene
- Single draw call for all pins (InstancedMesh)
- No real-time shadows
- Textures: 512×512 max (compressed)
- LOD not needed (scene is small and fixed distance)

---

## UI / HUD

### During Position Select

```
┌─────────────────────────┐
│                         │
│     [Bowling Lane       │
│      3D View]           │
│                         │
│      ● ← Ball position  │
│   ◄─────────────►       │
│   (drag to move)        │
│                         │
│     ┌─────────────┐     │
│     │   READY     │     │
│     └─────────────┘     │
│                         │
│  Frame: 3/10   Score: 45│
└─────────────────────────┘
```

### During Swing Phase

```
┌─────────────────────────┐
│                         │
│     [Bowling Lane       │
│      3D View]           │
│                         │
│                         │
│                         │
│                         │
│   🎳 SWING WHEN READY!  │
│                         │
│                         │
│  Frame: 3/10   Score: 45│
└─────────────────────────┘
```

### After Throw (Result)

```
┌─────────────────────────┐
│                         │
│     [Pin Impact View]   │
│                         │
│                         │
│      ╔═══════════╗      │
│      ║  STRIKE!  ║      │
│      ╚═══════════╝      │
│                         │
│     ┌─────────────┐     │
│     │ NEXT FRAME  │     │
│     └─────────────┘     │
│                         │
│  Frame: 3/10   Score: 75│
└─────────────────────────┘
```

### Scorecard

A compact bowling scorecard at the bottom or accessible via swipe-up:

```
┌───┬───┬───┬───┬───┬───┬───┬───┬───┬────┐
│ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │ 9 │ 10 │
├───┼───┼───┼───┼───┼───┼───┼───┼───┼────┤
│X  │7/ │9- │X  │   │   │   │   │   │    │
│30 │49 │58 │   │   │   │   │   │   │    │
└───┴───┴───┴───┴───┴───┴───┴───┴───┴────┘
```

Uses standard bowling notation: `X` = strike, `/` = spare, `-` = miss, number = pins knocked down.

---

## Scoring

Standard 10-pin bowling scoring:

- **10 frames** per game
- **2 rolls per frame** (except 10th frame: up to 3 rolls)
- **Strike** (X): All 10 pins on first roll → 10 + next 2 rolls
- **Spare** (/): All 10 pins across both rolls → 10 + next 1 roll
- **Open frame**: Sum of pins knocked down
- **Perfect game**: 12 consecutive strikes = 300 points

### Second Ball Logic

If the first ball doesn't knock all pins down:
1. Remaining pins stay in position (no reset)
2. Player returns to position select (ball reappears)
3. Player aims for the spare
4. Standing pins are rendered clearly; fallen pins are cleared from scene

---

## Sound & Haptics

### Sound Effects

| Event | Sound | Priority |
|-------|-------|----------|
| Ball rolling | Low rumble, increasing as ball speeds up | Medium |
| Pin impact | Crash/clatter (varies by pin count) | High |
| Strike | Satisfying crash + crowd cheer | High |
| Spare | Crash + polite applause | Medium |
| Gutter | Thud + crowd groan | Medium |
| UI tap | Subtle click | Low |
| Swing detected | Whoosh | Medium |

### Sound Implementation Notes

- Use the Web Audio API for low-latency playback
- Preload all sounds during game init (they're small)
- Respect the device's silent/mute switch where possible (check `AudioContext.state`)
- Provide a mute toggle in the UI

### Haptic Feedback

| Event | Pattern | Notes |
|-------|---------|-------|
| Ball release detected | Single 30ms pulse | Confirms the swing registered |
| Pin hit | 50ms pulse | Feels impactful |
| Strike | 3 quick pulses (30ms on, 30ms off, repeated) | Celebration |
| Gutter | Long 100ms buzz | Disappointment |

---

## Edge Cases & Error Handling

### Sensor Not Available

- **Desktop/laptop users**: Show a friendly message: "This game requires a phone with motion sensors. Open this link on your phone!" with a QR code pointing to the game URL.
- **Old phones without gyro**: Same message, suggest upgrading browser.

### Permission Denied (iOS)

- Show step-by-step instructions to enable motion access:
  1. Open Settings
  2. Go to Safari > Motion & Orientation Access
  3. Toggle ON
  4. Return to game and refresh

### Phone Drops During Play

- If sensor data suddenly goes extreme (freefall: all axes near 0g), ignore it
- If sensor data stops arriving, show "Lost connection to sensors — tap to retry"

### Screen Lock / Tab Switch

- Pause game immediately on `visibilitychange`
- Resume with a "tap to continue" overlay (don't jump straight back into swing detection)
- If in mid-swing when interrupted, cancel the throw

### Accidental Navigation

- Prevent pull-to-refresh (CSS `overscroll-behavior: none`)
- Prevent back swipe (careful — don't break actual back navigation entirely)
- Prevent zoom (`<meta name="viewport" content="... user-scalable=no">`)

### Very Fast / Very Slow Throws

- Cap maximum ball speed (prevent impossible throws)
- Set minimum speed threshold (below it, the ball barely moves — visual feedback to throw harder)
- If no swing detected after 10 seconds in swing phase, show a helpful nudge: "Swing your phone forward like a bowling motion!"

---

## Implementation Plan

Ordered by priority and dependency. Each step produces something testable.

### Phase 1: Foundation

| # | Task | Depends On | Deliverable |
|---|------|-----------|-------------|
| 1.1 | Project scaffolding | — | Vite project, package.json, folder structure |
| 1.2 | Dockerfile + verify deployment | 1.1 | "Hello World" page live on roller-phone.theclusterflux.com |
| 1.3 | Hub page (static) | 1.1 | Landing page with game grid (bowling = only entry) |
| 1.4 | Sensor permission flow | 1.1 | "Enable Motion" button on hub, permission state tracked |

### Phase 2: Sensor Layer

| # | Task | Depends On | Deliverable |
|---|------|-----------|-------------|
| 2.1 | GyroManager class | 1.4 | Reads sensor data, exposes clean API |
| 2.2 | Calibration module | 2.1 | Zero-point calibration flow |
| 2.3 | Swing detection | 2.1, 2.2 | Detects bowling swing, extracts power/angle/spin |
| 2.4 | Debug overlay | 2.1 | Shows raw sensor values + computed parameters on screen |

### Phase 3: Bowling Scene

| # | Task | Depends On | Deliverable |
|---|------|-----------|-------------|
| 3.1 | Three.js scene setup | 1.1 | Empty bowling lane rendered (lane, gutters, camera) |
| 3.2 | Pin models + placement | 3.1 | 10 pins in triangle formation |
| 3.3 | Ball model + rolling anim | 3.1 | Ball at foul line, rolls forward on command |
| 3.4 | Position selector UI | 3.1 | Drag ball left/right at foul line |

### Phase 4: Gameplay

| # | Task | Depends On | Deliverable |
|---|------|-----------|-------------|
| 4.1 | Connect swing → ball | 2.3, 3.3 | Swing phone → ball rolls with matching speed/angle/spin |
| 4.2 | Ball physics (curve path) | 4.1 | Ball follows curved path based on spin |
| 4.3 | Pin collision detection | 3.2, 4.2 | Ball hits pins, pins fall |
| 4.4 | Pin chain reactions | 4.3 | Knocked pins knock over neighbors |
| 4.5 | Scoring engine | — | Standard 10-pin scoring logic |
| 4.6 | Game flow (frames) | 4.3, 4.5 | Full 10-frame game with spare handling |

### Phase 5: Polish

| # | Task | Depends On | Deliverable |
|---|------|-----------|-------------|
| 5.1 | Sound effects | 4.3 | Rolling, impact, strike/spare/gutter sounds |
| 5.2 | Haptic feedback | 4.1 | Vibration on release, impact, strike |
| 5.3 | Visual effects | 4.3 | Strike animation, ball trail, pin particles |
| 5.4 | Tutorial overlay | 4.1 | First-time "how to swing" animation |
| 5.5 | Scorecard UI | 4.6 | Visual scorecard with bowling notation |
| 5.6 | Sensitivity tuning | 4.1 | Playtest and adjust thresholds |

### Phase 6: Hardening

| # | Task | Depends On | Deliverable |
|---|------|-----------|-------------|
| 6.1 | Error handling (all edge cases) | Phase 4 | Graceful handling of all scenarios above |
| 6.2 | Performance optimization | Phase 4 | Achieve 60fps on target devices |
| 6.3 | Cross-browser testing | Phase 4 | iOS Safari, Chrome Android, Samsung Internet |
| 6.4 | Viewport / orientation handling | Phase 4 | Landscape lock, no-zoom, no-pull-to-refresh |

---

## Device Testing Matrix

| Device | OS | Browser | Priority |
|--------|----|---------|----------|
| iPhone 13+ | iOS 16+ | Safari | **Critical** (largest mobile web audience) |
| iPhone SE (2nd/3rd gen) | iOS 16+ | Safari | **High** (small screen, test layout) |
| Samsung Galaxy S21+ | Android 12+ | Chrome | **Critical** (Android reference) |
| Google Pixel 6+ | Android 12+ | Chrome | **High** |
| Mid-range Android | Android 11+ | Chrome | **Medium** (performance floor) |
| iPad | iPadOS 16+ | Safari | **Low** (works but not primary target) |
| Desktop | Any | Chrome/Firefox | **Low** (show "use your phone" message) |

---

## Open Questions (To Resolve During Development)

1. **Ball curve formula**: Quadratic curve vs. physics-based? Start simple, iterate.
2. **Pin collision**: Custom simplified model vs. Cannon.js? Start custom, upgrade if needed.
3. **Camera angle**: Fixed or slight follow? Test both.
4. **Landscape vs portrait**: Force landscape or support both? Test what feels better.
5. **Swing sensitivity**: Need real device testing to tune thresholds. Plan for a calibration/tuning session on multiple devices.
6. **Sound on iOS**: iOS Safari blocks autoplay audio until user interaction. Need a "tap to start" or use the WebAudio API unlock pattern.
7. **Second ball positioning**: Reset ball to previous position or let player choose again? Probably let them choose again (like real bowling, you adjust for the spare).
