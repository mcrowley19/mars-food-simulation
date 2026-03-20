# Greenhouse Scene

The 3D Mars colony renderer and all supporting modules. Uses Three.js via raw WebGL (not react-three-fiber) for full control over the render loop.

---

## File Map

| File | Responsibility |
|---|---|
| `GreenhouseScene.jsx` | Render loop, tick scheduling, user interactions, HUD, agent log sidebar |
| `GreenhouseScene.css` | Styling for all UI overlays, HUD panels, agent log tabs, loading screen |
| `sceneSetup.js` | Three.js renderer, orthographic camera, scene, Mars terrain |
| `domeBuilder.js` | Dome geometry, interior planters, decorative domes, silos |
| `cropRenderer.js` | Maps simulation crop state to plant meshes and soil colours |
| `hudUpdater.js` | Derives compact HUD values from raw simulation state |
| `constants.js` | Dome sizes, zoom levels, crop colours, lerp/easeInOut helpers, `scaleDomeDefs` |

---

## Architecture

`GreenhouseScene.jsx` is the only React component. Everything else is plain JS modules called from within the component's `useEffect` render loop.

```
GreenhouseScene.jsx
    ├── initScene()         → renderer, camera, scene         (sceneSetup.js)
    ├── buildTerrain()      → Mars ground plane                (sceneSetup.js)
    ├── setupLighting()     → ambient + directional + sun      (sceneSetup.js)
    ├── buildColony()       → domes, interiors, silos, decorative domes  (domeBuilder.js)
    ├── distributeCrops()   → assign crops to dome plant slots (cropRenderer.js)
    ├── updateCropsAndBeds()→ update mesh visuals each frame   (cropRenderer.js)
    └── computeHud()        → derive HUD values from state     (hudUpdater.js)
```

---

## Camera

Orthographic camera at `y=160` looking straight down. This gives the top-down isometric feel. In the coordinate system:

- `+Z` = bottom of screen (toward viewer)
- `-Z` = top of screen (away from viewer)
- `+X` = right
- `-X` = left

Dome positions are defined in XZ world units. The default dome is at `(0, 0)`.

---

## Scene Elements

### Main Dome (`buildSingleDome`)
- Hemisphere shell (`SphereGeometry`, half-sphere) with glass `MeshPhysicalMaterial`
- Latitude and longitude ribs (`TorusGeometry`)
- Base ring and concrete foundation ring
- Interior: white circular floor, wooden planter beds, soil meshes, plant group meshes, invisible hit meshes for hover

### Decorative Domes (`buildDecorativeDome`)
- Simplified version of the main dome (no interior, fewer polygons)
- White floor disc at `y=0.1` matching the main dome interior floor level
- Scattered in an organic cluster on the bottom-right of the main dome to suggest a realistic base layout

### Silos (`buildSilo`)
- Cylindrical tank body, conical hopper, support legs, diagonal braces, roof cap
- Placed behind the main dome (negative Z = top of screen)
- Two silos per dome, slightly separated

### Terrain
- `PlaneGeometry(3200, 3200)` with a repeating Mars ground texture
- Sits at `y=0.08`

---

## Render Loop

The RAF loop runs continuously at display frame rate. Each frame it:

1. Updates sun position and angle based on `simDayFracRef` (fractional progress through the current sol)
2. Computes `dayFactor` and `twilight` for smooth dawn/dusk lighting
3. Lerps all visual parameters (sun intensity, ambient tint, fog density, CO₂ tint) toward their targets
4. Calls `updateCropsAndBeds()` with latest state
5. Renders the scene

Simulation ticks (`POST /simulate-tick`) are separate from the render loop — fired by `setInterval` every 6 000 ms (normal) or 2 000 ms (fast-forward).

---

## Crop Rendering (`cropRenderer.js`)

`distributeCrops(greenhouses, crops)` assigns simulation crops to physical plant mesh slots in dome order. `updateCropsAndBeds(greenhouses, crops, state)` is called each frame to update:

- Plant mesh geometry and colour based on crop type and health
- Soil colour (dark when empty, brown when planted)
- Emissive glow on crops that are `ready_to_harvest`
- Scale based on `age_days / maturity_days`

---

## HUD (`hudUpdater.js`)

`computeHud(simState, resourceHistory)` returns a flat object of display-ready values:
- `waterL`, `nutrientsKg`, `fuelKg` — current resource levels
- `caloriesAvailable`, `calorieDaysRemaining` — food runway
- `missionDay`, `missionDays` — sol counter
- `activeEvents` — array of current event strings
- `cropCounts` — count by status (growing / ready / dead)
- `environment` — temp, CO₂, humidity, light

---

## Agent Logs Sidebar

Driven by `simState.agent_logs_parsed` from the backend. Organised in tabs by agent name. Each entry shows:
- Sol number
- Task lines (what the orchestrator asked the agent to do)
- Response lines (what the agent reported back)

Poll rate is 400 ms when the sidebar is open, 900 ms when closed, to balance responsiveness with API load.

---

## Dome Enter/Exit

Clicking "Enter the Dome" or a dome directly triggers a smooth orthographic camera zoom animation (`anim` object on `stateRef`). The camera lerps from `ZOOM_DEFAULT (0.95)` to a computed `enterZoomForRadius(r)` value over `ANIM_DURATION (1.2s)`. Exiting reverses the animation.

---

## Extension Tips

- **New HUD metric**: add to `computeHud()` in `hudUpdater.js`, then render in `GreenhouseScene.jsx`
- **New crop visual state**: add a branch in `updateCropsAndBeds()` in `cropRenderer.js`
- **New dome geometry**: modify `buildSingleDome()` or `buildDecorativeDome()` in `domeBuilder.js`
- **New scene object**: add a builder function in `domeBuilder.js` or `sceneSetup.js`, call it from `buildColony()` or the scene setup effect
- **New constant**: add to `constants.js` and import where needed — avoid magic numbers scattered through JSX
