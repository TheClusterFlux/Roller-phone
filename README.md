# Roller Phone

A collection of mobile web games that use your phone's gyroscope and accelerometer as the primary controller. Hold your phone, move your body, and play.

Live at: **https://roller-phone.theclusterflux.com**

## What Is This?

Roller Phone is a hub for motion-controlled browser games designed for phones. Every game leverages the DeviceOrientation and DeviceMotion Web APIs so your phone becomes a physical controller — think Wii Sports, but in a browser.

The first game is **Bowling**: adjust your starting position on-screen, then physically swing your phone to roll the ball down the lane.

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Runtime** | Node.js | Lightweight, fast builds |
| **Framework** | None (vanilla HTML/CSS/JS) or lightweight lib (Three.js for 3D) | Minimal bundle, fast load on mobile, no framework overhead for real-time games |
| **3D Rendering** | Three.js | Hardware-accelerated bowling lane, pins, ball — runs well on mobile GPUs |
| **Sensors** | DeviceOrientation / DeviceMotion Web APIs | Native browser support on iOS & Android, no app install needed |
| **Build** | Vite | Fast dev server, optimised production builds, native ES module support |
| **Container** | Docker (Node + static serve) | Matches the TheClusterFlux deployment pipeline |
| **Orchestration** | Kubernetes | Deployed via the existing GitHub Actions workflow |
| **Domain** | roller-phone.theclusterflux.com | Auto-configured via Ingress |

## Project Structure (Planned)

```
/
├── src/
│   ├── hub/                  # Game hub / launcher page
│   │   ├── index.html
│   │   ├── hub.js
│   │   └── hub.css
│   ├── shared/               # Shared utilities across all games
│   │   ├── gyro.js           # Gyroscope/accelerometer abstraction
│   │   ├── orientation.js    # Device orientation helpers
│   │   ├── permissions.js    # Sensor permission handling (iOS 13+)
│   │   ├── calibration.js    # Zero-point calibration utilities
│   │   └── haptics.js        # Vibration API wrapper
│   ├── bowling/              # First game: Bowling
│   │   ├── index.html
│   │   ├── main.js           # Entry point
│   │   ├── scene.js          # Three.js scene setup
│   │   ├── physics.js        # Ball/pin physics
│   │   ├── controls.js       # Gyro-to-bowling-action mapping
│   │   ├── ui.js             # HUD, score, position selector
│   │   └── assets/           # Models, textures, sounds
│   └── [future-games]/       # Additional games follow the same pattern
├── public/                   # Static assets (favicon, manifest, etc.)
├── Dockerfile
├── deployment.yaml
├── vite.config.js
├── package.json
└── docs/
    ├── DESIGN.md             # Architecture & technical design
    └── GAME_DESIGN.md        # Bowling game design & mechanics
```

## Getting Started (Development)

```bash
# Install dependencies
npm install

# Start dev server (with HTTPS for sensor API access)
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

> **Important**: The DeviceOrientation/DeviceMotion APIs require a **secure context** (HTTPS). During local development, Vite's HTTPS mode or tunnelling (e.g. ngrok) is needed to test on a real phone.

## Deployment

Handled automatically by the GitHub Actions pipeline:

1. Push to `main`
2. GitHub Actions builds the Docker image
3. Image is pushed to Docker Hub (`keanuwatts/theclusterflux:Roller-phone`)
4. `kubectl apply` deploys to the cluster
5. Live at `roller-phone.theclusterflux.com`

## Documentation

- **[Architecture & Technical Design](docs/DESIGN.md)** — System architecture, routing, sensor abstraction, and infrastructure decisions.
- **[Bowling Game Design](docs/GAME_DESIGN.md)** — Game mechanics, physics model, gyroscope mapping, and UX flow for the bowling game.

## Adding a New Game

Each game lives in its own directory under `src/`. To add a new game:

1. Create `src/your-game/` with its own `index.html` and entry JS
2. Register the game in the hub's game registry
3. Use the shared gyro/orientation utilities from `src/shared/`
4. Add a route in the Vite config

See [DESIGN.md](docs/DESIGN.md) for the full guide on the game plugin architecture.
