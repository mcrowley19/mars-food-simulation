# Greenhouse Scene README

This folder contains the main Mars colony simulation renderer and all supporting modules.

## File-by-File Guide

| File | Responsibility | Typical edits |
|---|---|---|
| `GreenhouseScene.jsx` | orchestrates render loop, interactions, backend tick calls, HUD, and agent-log tabs | UI logic, camera behavior, overlays, simulation tick behavior |
| `GreenhouseScene.css` | visual styling for scene controls and HUD panels | spacing, color, panel layout, responsive tuning |
| `constants.js` | shared constants and math helpers used across scene modules | tuning dome sizes, zoom, colors, interpolation helpers |
| `sceneSetup.js` | Three.js renderer/scene/camera bootstrap + terrain + global lights | performance and baseline scene setup |
| `domeBuilder.js` | dome geometry, interior planters, plant meshes, hitboxes | structural dome/interior visual changes |
| `cropRenderer.js` | state-to-mesh mapping for crops/soil and condition-based styling | crop visual behavior and interpolation rules |
| `hudUpdater.js` | computes compact HUD state from simulation data | HUD metrics and derived values |

## Runtime Responsibilities

`GreenhouseScene.jsx` performs:

- polling consumption (`useGreenhouseState`)
- user-driven and timer-driven tick sync (`/simulate-tick`)
- dome enter/exit interaction
- hover tooltip hydration
- bottom-left resources panel rendering
- agent logs panel (tabbed by agent, driven by backend `agent_logs_parsed`)

## Extension Tips

- Add new HUD metrics in `hudUpdater.js`, then render in `GreenhouseScene.jsx`.
- Add new visual states for crops/soil in `cropRenderer.js`.
- Keep low-level geometry isolated in `domeBuilder.js` to avoid bloating top-level scene logic.
- If adding backend fields, prefer reading them in one place and propagating via computed HUD model.
