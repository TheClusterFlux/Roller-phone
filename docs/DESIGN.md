# Architecture & Technical Design

This document covers the full technical plan for Roller Phone — a mobile web game hub powered by phone gyroscopes.

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Tech Stack Rationale](#tech-stack-rationale)
3. [Routing & Multi-Page Setup](#routing--multi-page-setup)
4. [The Hub Page](#the-hub-page)
5. [Shared Sensor Abstraction Layer](#shared-sensor-abstraction-layer)
6. [Game Plugin Architecture](#game-plugin-architecture)
7. [Build & Bundling](#build--bundling)
8. [Docker & Deployment](#docker--deployment)
9. [Mobile-First Constraints](#mobile-first-constraints)
10. [Security & Permissions](#security--permissions)
11. [Performance Budget](#performance-budget)
12. [Future Considerations](#future-considerations)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser (Phone)                │
│                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐     │
│  │   Hub    │   │ Bowling  │   │ Game N   │     │
│  │  Page    │──▶│  Game    │   │ (future) │     │
│  └──────────┘   └────┬─────┘   └──────────┘     │
│                      │                           │
│              ┌───────┴────────┐                  │
│              │  Shared Layer  │                  │
│              │  - gyro.js     │                  │
│              │  - permissions │                  │
│              │  - calibration │                  │
│              │  - haptics     │                  │
│              └───────┬────────┘                  │
│                      │                           │
│              ┌───────┴────────┐                  │
│              │  Web APIs      │                  │
│              │  DeviceMotion  │                  │
│              │  DeviceOrient. │                  │
│              │  Vibration     │                  │
│              └────────────────┘                  │
└─────────────────────────────────────────────────┘
         │
         │ HTTPS (port 8080)
         ▼
┌─────────────────┐    ┌──────────────┐
│  K8s Ingress    │───▶│  Node.js     │
│  (nginx, TLS)   │    │  Static      │
│                 │    │  Server      │
└─────────────────┘    └──────────────┘
```

The app is **entirely client-side**. The server is a simple static file server — no backend logic, no database, no WebSocket server. All game logic, physics, and sensor processing runs in the browser.

---

## Tech Stack Rationale

### Why Vanilla JS + Three.js (No React/Vue/Angular)

- **Performance**: Game loops need 60fps. Framework overhead (virtual DOM diffing, reactivity systems) adds latency we don't want.
- **Bundle size**: Frameworks add 30-100KB+ gzipped. On mobile networks, every KB matters for first load.
- **Control**: Direct DOM and Canvas/WebGL access without framework abstractions getting in the way of real-time rendering.
- **Three.js** is the only significant dependency — it handles WebGL rendering, 3D math, and has excellent mobile GPU support.

### Why Vite

- Native ES modules in dev = instant hot reload
- Rollup-based production builds with tree-shaking
- Built-in multi-page app support (each game is its own HTML entry)
- HTTPS dev server mode for testing sensor APIs locally

### Why Static Serving (No SSR)

- Games are entirely client-side; there's nothing to server-render
- Static files cache perfectly at the CDN/Ingress level
- Simplest possible container (just serve files on port 8080)

---

## Routing & Multi-Page Setup

Roller Phone uses **Vite's multi-page app (MPA) mode** rather than a single-page app with client-side routing. Each game is a separate HTML entry point.

### URL Structure

| URL | What it serves |
|-----|---------------|
| `/` | Hub page — game launcher/selector |
| `/bowling/` | Bowling game |
| `/[game-name]/` | Future games |

### Why MPA over SPA

- Each game can have completely different dependencies (one might use Three.js, another might use 2D Canvas)
- No shared runtime overhead between games
- Games load independently — bowling doesn't need to download code for future games
- Clean code splitting by default

### Vite Configuration (Planned)

```js
// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    rollupOptions: {
      input: {
        hub: resolve(__dirname, 'src/hub/index.html'),
        bowling: resolve(__dirname, 'src/bowling/index.html'),
        // Add new games here
      },
    },
  },
  server: {
    https: true, // Required for DeviceMotion/Orientation APIs
  },
});
```

---

## The Hub Page

The hub is the landing page at `/`. It serves as a game launcher.

### Features

- **Game grid/list**: Shows all available games with thumbnails, names, and short descriptions
- **Sensor check**: On first load, tests whether the device supports gyroscope/accelerometer and shows a clear message if not (e.g. desktop users)
- **Permission prompt**: On iOS 13+, DeviceMotion requires an explicit user gesture to grant permission. The hub handles this once so games don't each need to
- **Responsive**: Designed for portrait phone screens, but gracefully handles landscape and tablets

### Game Registry

Games are registered in a simple manifest:

```js
// hub/games.js
export const games = [
  {
    id: 'bowling',
    name: 'Bowling',
    description: 'Swing your phone to roll a strike!',
    path: '/bowling/',
    thumbnail: '/assets/bowling-thumb.png',
    minSensors: ['accelerometer'], // Required sensors
    status: 'playable', // 'playable' | 'coming-soon'
  },
  // Future games added here
];
```

### Design Direction

- Dark background with vibrant game cards
- Large touch targets (minimum 48x48px per WCAG)
- Smooth entry animations
- Fullscreen prompt on game launch (for immersion)

---

## Shared Sensor Abstraction Layer

The most critical piece of shared infrastructure. Lives in `src/shared/` and provides a clean API for all games to consume.

### `permissions.js` — Permission Handling

iOS 13+ requires a user-initiated gesture to access motion sensors. This module handles the platform differences.

```
┌────────────────────────────────────┐
│       Permission Flow              │
│                                    │
│  1. Check if API exists            │
│  2. Check if permission needed     │
│     (iOS 13+ only)                 │
│  3. Show "tap to enable" button    │
│  4. On tap, call                   │
│     DeviceMotionEvent              │
│     .requestPermission()           │
│  5. Store result                   │
│  6. If denied, show instructions   │
│     to enable in Settings          │
└────────────────────────────────────┘
```

**Key concern**: `DeviceMotionEvent.requestPermission()` MUST be called from a user gesture (click/tap). It cannot be called on page load. The hub will present a clear "Enable Motion Controls" button.

### `gyro.js` — Sensor Data Stream

Wraps `DeviceMotionEvent` and `DeviceOrientationEvent` into a unified, game-friendly API.

**Planned API surface:**

```js
class GyroManager {
  // Start listening to sensor events
  start()

  // Stop listening (battery/performance)
  stop()

  // Current state (polled by game loop)
  get acceleration()      // { x, y, z } in m/s² (gravity removed)
  get accelerationWithGravity() // { x, y, z } including gravity
  get rotationRate()      // { alpha, beta, gamma } in deg/s
  get orientation()       // { alpha, beta, gamma } absolute orientation

  // Event-based (for gesture detection)
  onSwing(callback)       // Detects a swing/throw gesture
  onShake(callback)       // Detects shaking
  onTilt(callback)        // Continuous tilt data

  // Sampling
  get sampleRate()        // Actual Hz being received
  get isActive()          // Whether sensors are streaming
}
```

**Implementation notes:**
- Sensor data arrives at varying rates (60-200Hz depending on device). We normalize to a consistent internal rate
- Low-pass filtering to smooth noisy sensor data
- High-pass filtering for isolating sudden movements (swings, jerks)
- All values in a consistent coordinate system regardless of screen orientation

### `calibration.js` — Zero-Point Calibration

Before each game action, the player needs to "zero" their starting position. This module handles that.

**Flow:**
1. Player holds phone in their comfortable starting position
2. Game says "Hold still..." and samples sensor data for ~1 second
3. Average readings become the zero reference
4. All subsequent readings are relative to this calibrated zero

This is critical for bowling — the "wind-up" and "release" need to be relative to how the player naturally holds their phone.

### `haptics.js` — Vibration Feedback

Wraps the Vibration API for tactile feedback.

```js
haptics.tap()       // Short 10ms buzz (UI feedback)
haptics.impact()    // Medium 50ms buzz (ball release, pin hit)
haptics.success()   // Pattern buzz (strike/spare)
haptics.error()     // Double buzz (gutter)
```

**Note**: Vibration API support is inconsistent (iOS Safari does not support it). Haptics are always optional/progressive.

---

## Game Plugin Architecture

Each game follows a standard structure to keep things consistent and make adding new games straightforward.

### Required Game Structure

```
src/[game-name]/
├── index.html          # HTML entry point (loaded by Vite MPA)
├── main.js             # Game initialization and lifecycle
├── [game-specific].js  # Game logic modules
└── assets/             # Game-specific assets (models, textures, sounds)
```

### Game Lifecycle

Every game implements a standard lifecycle:

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  INIT    │───▶│  READY   │───▶│ PLAYING  │───▶│ RESULT   │
│          │    │          │    │          │    │          │
│ Load     │    │ Calibrate│    │ Game     │    │ Show     │
│ assets,  │    │ sensors, │    │ loop     │    │ score,   │
│ setup    │    │ show     │    │ running  │    │ replay   │
│ scene    │    │ tutorial │    │          │    │ option   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                     │
                                                     ▼
                                              ┌──────────┐
                                              │  HUB     │
                                              │ (back)   │
                                              └──────────┘
```

### Standard Game API

```js
class Game {
  constructor(containerId) { }

  async init()    // Load assets, set up scene
  async ready()   // Calibrate sensors, show instructions
  start()         // Begin game loop
  pause()         // Pause (tab hidden, phone call, etc.)
  resume()        // Resume from pause
  dispose()       // Clean up (WebGL contexts, event listeners, sensors)
}
```

### Adding a New Game Checklist

1. Create directory `src/[game-name]/`
2. Add `index.html` with the game container and shared CSS
3. Implement `main.js` following the Game lifecycle
4. Import and use `GyroManager` from `src/shared/gyro.js`
5. Register the game in `src/hub/games.js`
6. Add the HTML entry to `vite.config.js` `rollupOptions.input`
7. Add a thumbnail to `public/assets/`

---

## Build & Bundling

### Development

```bash
npm run dev
# Starts Vite dev server with HTTPS on https://localhost:5173
# Hot module replacement for instant feedback
# Test on phone via local network: https://192.168.x.x:5173
```

### Production Build

```bash
npm run build
# Output: dist/
#   dist/index.html          (hub)
#   dist/bowling/index.html  (bowling game)
#   dist/assets/             (hashed JS/CSS bundles)
```

### Bundle Size Targets

| Asset | Target | Notes |
|-------|--------|-------|
| Hub page (total) | < 50KB gzipped | Mostly CSS + small JS |
| Bowling game (total) | < 500KB gzipped | Three.js is ~150KB gzipped, rest is game code + models |
| Three.js (tree-shaken) | < 200KB gzipped | Only import what we use |

---

## Docker & Deployment

### Dockerfile (Planned)

```dockerfile
# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
```

**Two-stage build** keeps the production image small (~50MB) — only the static files and a minimal server.

### Deployment Flow

```
git push main
    │
    ▼
GitHub Actions (deploy.yml)
    │
    ├── docker build -t keanuwatts/theclusterflux:Roller-phone .
    ├── docker push keanuwatts/theclusterflux:Roller-phone
    ├── kubectl apply -f deployment.yaml
    └── kubectl rollout restart deployment/roller-phone
    │
    ▼
Live at roller-phone.theclusterflux.com
```

### Health Check

The static server responds to any path, so a simple HTTP GET on `/` works as a liveness/readiness probe. If needed later, we can add a `/health` endpoint.

---

## Mobile-First Constraints

### Screen Orientation

- Hub: **Portrait** (natural phone orientation)
- Games: **Landscape** recommended for bowling (wider view of lane), but must work in portrait too
- Use the Screen Orientation API to *request* landscape, but don't force it (API support varies)

### Touch Input

- All UI interactions via touch (no hover states for primary actions)
- Position selector on bowling lane: **drag to move** starting position left/right
- Large buttons (minimum 48x48 CSS pixels)
- No pinch-to-zoom on game screens (set viewport meta appropriately)

### Performance

- Target: **60fps** on mid-range phones (2-3 year old devices)
- Use `requestAnimationFrame` for game loop
- Limit Three.js draw calls (instanced rendering for pins)
- Use low-poly models + baked lighting where possible
- Progressive quality: detect GPU tier and reduce effects on low-end devices

### Battery

- Stop sensor listeners when game is paused or tab is backgrounded
- Use `document.visibilitychange` to pause/resume
- Reduce rendering when idle (hub page doesn't need a render loop)

### Network

- Service Worker for offline caching (stretch goal)
- All assets cache-busted via Vite's content hashing
- Gzip/Brotli compression at the Ingress/server level

---

## Security & Permissions

### HTTPS Requirement

DeviceMotion and DeviceOrientation APIs require a **secure context** (HTTPS). This is already handled:
- Production: TLS termination at the K8s Ingress (cert: `theclusterflux` secret)
- Development: Vite's `--https` flag generates a self-signed cert

### Sensor Permission (iOS)

Starting with iOS 13, `DeviceMotionEvent.requestPermission()` must be called from a **user-activated event handler** (tap/click). This is a one-time permission per page load.

**Strategy:**
1. Hub page shows an "Enable Motion Controls" button on first visit
2. On tap, request permission
3. Store the permission state in sessionStorage
4. Each game checks permission state before accessing sensors
5. If denied, show clear instructions to enable in iOS Settings

### Content Security Policy

The static server should set appropriate CSP headers:
- `default-src 'self'`
- `script-src 'self'` (no inline scripts, no eval)
- `style-src 'self' 'unsafe-inline'` (Three.js injects some styles)
- `img-src 'self' blob: data:` (Three.js textures)

---

## Performance Budget

| Metric | Target | Measurement |
|--------|--------|-------------|
| First Contentful Paint | < 1.5s on 4G | Lighthouse |
| Time to Interactive | < 3s on 4G | Lighthouse |
| Game loop frame time | < 16.6ms (60fps) | Performance API |
| Sensor-to-screen latency | < 50ms | Manual testing |
| Total JS (per page) | < 500KB gzipped | Build output |

---

## Future Considerations

### Multiplayer (Stretch)

- WebRTC data channels for peer-to-peer multiplayer
- One phone as "screen" (TV/tablet), others as controllers
- Would require a signalling server (small Node.js backend)

### More Games (Planned)

Ideas that use gyro well:
- **Balancing game**: Keep a ball on a platform by tilting your phone
- **Sword fighting**: Swing/parry using phone orientation
- **Racing**: Tilt to steer, like a steering wheel
- **Golf**: Similar swing mechanic to bowling

### PWA / Installable

- Add a `manifest.json` for Add to Home Screen
- Service Worker for offline support
- Splash screen and app-like experience

### Analytics

- Lightweight, privacy-respecting analytics (e.g. Plausible, or custom)
- Track: games played, average scores, device types, sensor support rates
