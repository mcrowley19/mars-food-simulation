# Frontend README

The frontend is a React + Vite app with Three.js rendering for both the landing experience and the in-simulation greenhouse scene.

## Important Files

| File | Responsibility |
|---|---|
| `src/main.jsx` | app bootstrap + animated Mars favicon startup |
| `src/App.jsx` | top-level screen routing (`landing`, `dashboard`, `learn`, `greenhouse`) |
| `src/hooks/useGreenhouseState.js` | polling hook for backend `/state` + session header wiring |
| `src/utils/session.js` | browser-side session-id generation/reuse |
| `src/components/InitialiseSession.jsx` | mission setup UI and launch config controls |
| `src/components/LearnMore.jsx` | informational modal/overlay |
| `src/components/Mars.jsx` | hero Mars sphere + shader atmosphere |
| `src/components/Stars.jsx` | starfield background visuals |
| `src/components/greenhouse/GreenhouseScene.jsx` | primary simulation overlay (3D + HUD + logs + interactions) |
| `src/components/greenhouse/GreenhouseScene.css` | scene/HUD/log panel styling |

## Data Flow

1. User configures mission in `InitialiseSession`.
2. `App.jsx` submits setup payload to backend.
3. Greenhouse view mounts `GreenhouseScene`.
4. `useGreenhouseState` polls `/state` on an interval from `GreenhouseScene` (faster when the agent logs sidebar is open).
5. `GreenhouseScene` maps state into:
   - 3D visuals (domes, crops, lighting/fog)
   - HUD stats (water, nutrients, crops, env)
   - Agent Logs tabs (from `agent_logs_parsed`)

## Scripts

From `frontend/`:

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

## Greenhouse Module Docs

For the detailed map of the `greenhouse/` scene system, see:

- `src/components/greenhouse/README.md`
