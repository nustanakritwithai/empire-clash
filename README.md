# Empire Clash

3D FPS multiplayer — faction war game inspired by Empire Clash.

Built with Three.js (client) + Express/WebSocket (server) on Node.js.

## Quick Start

```bash
npm install
npm start
```

Open http://localhost:3000 in browser.

For development with auto-reload:
```bash
npm run dev
```

## Multiplayer Test

1. Open http://localhost:3000 in browser tab 1
2. Open http://localhost:3000 in browser tab 2 (or different browser/incognito)
3. Both players should see each other in the world
4. Move with WASD, look with mouse, shoot with click

## Mobile Controls

- Left bottom: joystick (move)
- Left top: shoot button (hold = auto-fire)
- Right top: crouch/prone toggle
- Right bottom: look drag / tap = jump / reload / sprint / zoom buttons
- Knife button next to shoot (melee attack)

## Features (Current)

- 3D FPS view (1st/3rd person toggle with V)
- 3 weapons: Rifle, SMG, Sniper (switch with 1/2/3)
- Zoom/aim with dynamic crosshair + sniper scope overlay
- Melee attack (knife): F or Q on keyboard, button on mobile
- 4 classes: Soldier, Medic, Sniper, Engineer
- Touch controls with layout edit mode (drag/resize buttons)
- WebSocket multiplayer (real-time position sync)
- Units system (infantry, archer, cavalry)
- Health/respawn system
- Kill feed + hitmarker + headshot

## Tech Stack

- **Client**: Three.js r128 (CDN), vanilla JS
- **Server**: Express + ws (WebSocket), Node.js 18+
- **Transport**: JSON over WebSocket
- **Deploy**: Render.com (render.yaml included)

## Project Structure

```
empire-clash/
  public/
    index.html    — game page + UI elements
    game.js       — client game engine (rendering, input, movement, combat)
    net.js        — WebSocket client (connect, send, receive)
  server/
    index.js      — Express + WebSocket bootstrap
    room.js        — GameRoom (tick loop, players, units, combat, economy)
    classes.js    — class/weapon/unit/world definitions
    protocol.js   — JSON encode/decode helpers
  package.json
  render.yaml      — Render.com deployment config
```

## Manual Test Checklist

### Prerequisites
- [ ] Node.js 18+ installed
- [ ] `npm install` runs without errors
- [ ] `npm start` launches server on port 3000
- [ ] `curl http://localhost:3000/healthz` returns "ok"

### Single Player
- [ ] Open http://localhost:3000 in browser
- [ ] Class select screen appears
- [ ] Selecting a class spawns player into world
- [ ] WASD moves player
- [ ] Mouse moves camera (pointer lock)
- [ ] Click shoots weapon
- [ ] R reloads weapon
- [ ] 1/2/3 switches weapons
- [ ] V toggles 1st/3rd person camera
- [ ] F or Q performs melee attack
- [ ] Crosshair shows and expands when moving/shooting
- [ ] Zoom button/scope overlay works

### Multiplayer
- [ ] Open second browser tab/window
- [ ] Both players see each other in the world
- [ ] Player 1 moving is visible to Player 2 and vice versa
- [ ] Shooting creates visible bullet tracer for other player
- [ ] Hitting other player reduces their HP
- [ ] Kill shows in kill feed
- [ ] Dead player respawns after 5 seconds

### Stability
- [ ] Server runs 5 minutes without crash
- [ ] No console errors in browser after 5 minutes
- [ ] No server crash on player disconnect

### Mobile (if testing on touch device)
- [ ] Joystick (left bottom) moves player
- [ ] Shoot button (left top) fires
- [ ] Crouch/prone button works
- [ ] Look drag (right side) rotates camera
- [ ] Tap right side jumps
- [ ] Reload, sprint, zoom, melee buttons work
- [ ] Layout edit mode can drag/resize buttons

## Deployment (Render)

1. Push to GitHub
2. Create new Web Service on Render, connect repo
3. Render detects render.yaml automatically
4. Build command: `npm install`
5. Start command: `npm start`
6. Health check: /healthz

## Roadmap

See the 25-phase development plan in the project documentation.

Current status: Phase 1 — Stabilize Prototype