# Frontend

React 19 + Three.js application rendering the Mars colony simulation. Communicates with the FastAPI backend via HTTP polling.

---

## Stack

| Library | Version | Purpose |
|---|---|---|
| React | 19 | UI framework |
| Three.js | 0.183 | 3D WebGL rendering |
| Vite | 8 | Build tool and dev server |
| react-markdown + remark-gfm | latest | Agent log markdown rendering |

---

## Source Structure

```
src/
├── App.jsx                         # Top-level screen router
├── App.css
├── main.jsx                        # React entry point
├── index.css                       # Global styles
├── marsFavicon.js                  # Animated Mars favicon
├── components/
│   ├── InitialiseSession.jsx       # Setup screen (manual and AI-optimised modes)
│   ├── InitialiseSession.css
│   ├── LearnMore.jsx               # Educational overlay about Mars farming
│   ├── LearnMore.css
│   ├── Mars.jsx                    # Rotating 3D Mars sphere (landing screen)
│   ├── Stars.jsx                   # Starfield background
│   └── greenhouse/                 # 3D colony renderer — see greenhouse/README.md
├── hooks/
│   └── useGreenhouseState.js       # HTTP polling hook for simulation state
└── utils/
    ├── api.js                      # API_BASE_URL constant
    └── session.js                  # Session ID generation and localStorage persistence
```

---

## Screen Flow

```
landing  →  dashboard (InitialiseSession)  →  greenhouse (GreenhouseScene)
```

`App.jsx` manages the three screens and transitions:

- **Landing** — animated Mars sphere, starfield, press Space or click to continue
- **Dashboard** — `InitialiseSession.jsx` — choose manual or AI-optimised setup, configure mission, launch
- **Greenhouse** — `GreenhouseScene.jsx` — 3D colony view with simulation running and agent logs sidebar

---

## Setup Flow (`InitialiseSession.jsx`)

### Manual mode
User fills in astronaut count, mission duration, floor space, water, nutrients, soil, seed types and counts, food supplies (kcal), and fuel (kg). On submit, `POST /setup/manual` is called. After success, `POST /invoke` fires the initial orchestrator prompt (fire-and-forget), then the greenhouse screen loads immediately while the agent works in the background.

### AI-Optimised mode
User fills in astronaut count, mission duration, and max cargo weight. The frontend:
1. Calls `POST /setup/ai-optimised` (starts async AI planning on the backend)
2. Polls `GET /setup-status` every 2 s until `setup_complete` is true (up to 4 minutes)
3. Shows an AI reasoning summary card explaining the chosen allocation
4. On "Launch", calls `POST /invoke` with the AI reasoning summary, then loads the greenhouse

---

## State Polling (`useGreenhouseState.js`)

Polls `GET /state` on a configurable interval:
- **400 ms** when the agent logs sidebar is open
- **900 ms** when the sidebar is closed

Includes a 1.2 s retry on network errors to handle cold API starts. Returns the full state object including `agent_logs_parsed` — cleaned, truncated per-agent logs ready for display.

---

## Session Identity (`utils/session.js`)

A UUID session ID is generated on first load and stored in `localStorage`. Every API request includes it as the `x-session-id` header, giving each browser tab its own isolated mission state.

---

## Agent Initialisation Guard

`GreenhouseScene` receives an `awaitAgents` prop from `App.jsx`. When `true`, the simulation does not start playing until `simState.agents_initialised === true` (set by the backend as soon as the first orchestrator invocation begins). A 15-second fallback timeout clears the loading screen regardless, in case of a slow network or cold start.

---

## Data Flow

```
InitialiseSession → POST /setup/manual or /setup/ai-optimised
                  → POST /invoke (fire-and-forget)
                  → screen switches to GreenhouseScene

GreenhouseScene   → useGreenhouseState polls GET /state every 400–900ms
                  → setInterval fires POST /simulate-tick every 6s (normal) or 2s (fast-forward)
                  → state mapped into:
                      - Three.js dome/crop/lighting visuals
                      - HUD panels (water, calories, nutrients, fuel, environment)
                      - Agent logs sidebar (tabbed by agent, driven by agent_logs_parsed)
                      - Resource trend sparkline charts
```

---

## Scripts

From `frontend/`:

```bash
npm run dev       # Vite dev server at http://localhost:5173
npm run build     # Production build to dist/
npm run preview   # Preview production build
npm run lint      # ESLint
```

---

## Further Docs

- 3D greenhouse module: `src/components/greenhouse/README.md`
