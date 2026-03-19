import { useRef, useEffect, useState, useCallback } from 'react'
import * as THREE from 'three'
import useGreenhouseState from '../../hooks/useGreenhouseState'
import { initScene, buildTerrain, setupLighting } from './sceneSetup'
import { buildColony } from './domeBuilder'
import { updateCropsAndBeds } from './cropRenderer'
import { computeHud } from './hudUpdater'
import {
  FRUSTUM, DOME_OPACITY, ZOOM_DEFAULT, ZOOM_ENTERED, ZOOM_ALL,
  ANIM_DURATION, INITIAL_WATER, DOME_DEFS_BASE,
  lerp, easeInOut, scaleDomeDefs,
} from './constants'
import './GreenhouseScene.css'

let DOME_DEFS = DOME_DEFS_BASE

export default function GreenhouseScene({ onExit, totalDays = 350 }) {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const rafRef = useRef(null)
  const [hud, setHud] = useState({
    angle: 0, dir: 'N', fps: 0, dome: '—', zoom: '1.0',
    missionDay: 0, waterL: 0, nutrientsKg: 0,
    cropsGrowing: 0, cropsReady: 0, activeEvents: [],
    tempC: 22, co2Ppm: 800, humidityPct: 65, lightHours: 12,
    harvestedCount: 0, agentStatus: '',
    cropBreakdown: {},
  })
  const [enterLabel, setEnterLabel] = useState(null)
  const [insideDome, setInsideDome] = useState(null)
  const [simDay, setSimDay] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const isPlayingRef = useRef(false)
  const simDayFracRef = useRef(0.25)
  const playIntervalRef = useRef(null)
  const [domeDefs, setDomeDefs] = useState(null)

  const simState = useGreenhouseState(true)
  const simStateRef = useRef(null)
  const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const simulateTick = useCallback(async () => {
    try {
      const res = await fetch(`${API}/simulate-tick`, { method: 'POST' })
      if (res.ok) {
        const newState = await res.json()
        simStateRef.current = newState
      }
    } catch {
      // ignore network errors
    }
  }, [API])

  const lerpedRef = useRef({
    sunIntensityMul: 1.0,
    ambientTint: 1.0,
    tempTint: 0,
    fogDensity: 0,
    plantScales: [],
    co2Tint: 0,
  })

  useEffect(() => {
    simStateRef.current = simState
    if (simState?.mission_day && !isPlayingRef.current) {
      setSimDay(simState.mission_day)
    }
  }, [simState])

  useEffect(() => {
    if (domeDefs) return
    if (!simState) {
      const fallbackTimer = setTimeout(() => {
        setDomeDefs(prev => {
          if (prev) return prev
          DOME_DEFS = DOME_DEFS_BASE
          return DOME_DEFS_BASE
        })
      }, 3000)
      return () => clearTimeout(fallbackTimer)
    }
    const floor = simState?.resources?.floor_space_m2
      ?? simState?.floor_space_m2
      ?? simState?.greenhouse?.floor_space_m2
    if (floor && floor > 0) {
      DOME_DEFS = scaleDomeDefs(floor)
      setDomeDefs(DOME_DEFS)
    } else {
      DOME_DEFS = DOME_DEFS_BASE
      setDomeDefs(DOME_DEFS_BASE)
    }
  }, [simState, domeDefs])

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (stateRef.current) {
      const { renderer, scene } = stateRef.current
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose())
          else o.material.dispose()
        }
      })
      renderer.dispose()
    }
    stateRef.current = null
  }, [])

  useEffect(() => {
    if (!domeDefs) return
    const canvas = canvasRef.current
    if (!canvas) return

    const w = window.innerWidth, h = window.innerHeight
    const { renderer, scene, camera } = initScene(canvas, w, h)
    buildTerrain(scene)
    const greenhouses = buildColony(scene, DOME_DEFS)
    const { sun, ambient, fill } = setupLighting(scene)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    const anim = {
      active: false,
      entering: false,
      allMode: false,
      progress: 0,
      dome: null,
      startZoom: ZOOM_DEFAULT,
      endZoom: ZOOM_ENTERED,
      startX: 0, startZ: 0,
      endX: 0, endZ: 0,
    }

    stateRef.current = { renderer, scene, camera, sun, ambient, fill, greenhouses, anim, raycaster, pointer }

    const onClick = (e) => {
      if (anim.active) return
      const rect = canvas.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)

      const shells = greenhouses.map(g => g.getObjectByName('shell')).filter(Boolean)
      const hits = raycaster.intersectObjects(shells, false)
      if (hits.length > 0) {
        const domeGroup = hits[0].object.parent
        const domeId = domeGroup.userData.domeId
        const worldPos = new THREE.Vector3()
        domeGroup.getWorldPosition(worldPos)
        worldPos.y += domeGroup.userData.radius + 1
        const projected = worldPos.clone().project(camera)
        const sx = (projected.x * 0.5 + 0.5) * window.innerWidth
        const sy = (-projected.y * 0.5 + 0.5) * window.innerHeight
        setEnterLabel({ id: domeId, x: sx, y: sy, group: domeGroup })
      }
    }
    canvas.addEventListener('click', onClick)

    const onResize = () => {
      const nw = window.innerWidth, nh = window.innerHeight
      renderer.setSize(nw, nh)
      const a = nw / nh
      camera.left = -FRUSTUM * a; camera.right = FRUSTUM * a
      camera.top = FRUSTUM; camera.bottom = -FRUSTUM
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    const SUN_ORBIT_R = 140
    const SUN_MAX_H   = 80
    const SOL_DURATION = 10

    const DAY_BG     = new THREE.Color('#28120a')
    const NIGHT_BG   = new THREE.Color('#3a2530')
    const DAWN_SUN   = new THREE.Color('#ff8844')
    const NOON_SUN   = new THREE.Color('#ffe8cc')
    const bgColor    = new THREE.Color()
    const sunColor   = new THREE.Color()

    let lastTime = performance.now()
    let frameCount = 0, fpsAccum = 0, lastFpsUpdate = performance.now()

    const animate = (now) => {
      rafRef.current = requestAnimationFrame(animate)
      const dt = (now - lastTime) / 1000
      lastTime = now

      if (isPlayingRef.current) {
        simDayFracRef.current += dt / SOL_DURATION
        if (simDayFracRef.current >= 1) {
          simDayFracRef.current = 0
        }
      }

      const sunPhase = simDayFracRef.current
      const sunAngle = sunPhase * Math.PI * 2
      const sunY = Math.sin(sunAngle) * SUN_MAX_H
      const sunX = Math.cos(sunAngle) * SUN_ORBIT_R
      const sunZ = Math.sin(sunAngle + Math.PI / 3) * SUN_ORBIT_R * 0.6

      sun.position.set(sunX, Math.max(sunY, -SUN_MAX_H * 0.5), sunZ)
      sun.target.position.set(0, 0, 0)
      sun.target.updateMatrixWorld()

      const elevation = sunY / SUN_MAX_H
      const dayFactor = Math.max(0, elevation)
      const twilight  = Math.max(0, Math.min(1, (elevation + 0.15) / 0.3))

      const ss = simStateRef.current
      const env = ss?.environment || {}
      const events = ss?.active_events || []
      const lv = lerpedRef.current
      const LERP_SPEED = 4

      const tgtSunMul = typeof env.light_intensity === 'number' ? env.light_intensity : 1.0
      const tgtAmbientTint = typeof env.light_hours === 'number' ? Math.min(1, env.light_hours / 16) : 1.0
      const tgtTempTint = typeof env.temp_c === 'number'
        ? (env.temp_c < 15 ? -(15 - env.temp_c) / 15 : env.temp_c > 30 ? (env.temp_c - 30) / 20 : 0)
        : 0
      const tgtFogDensity = events.includes('dust_storm') ? 0.008 : 0
      const tgtCo2Tint = events.includes('co2_spike') ? 1 : 0

      lv.sunIntensityMul = lerp(lv.sunIntensityMul, tgtSunMul, Math.min(1, dt * LERP_SPEED))
      lv.ambientTint = lerp(lv.ambientTint, tgtAmbientTint, Math.min(1, dt * LERP_SPEED))
      lv.tempTint = lerp(lv.tempTint, tgtTempTint, Math.min(1, dt * LERP_SPEED))
      lv.fogDensity = lerp(lv.fogDensity, tgtFogDensity, Math.min(1, dt * LERP_SPEED))
      lv.co2Tint = lerp(lv.co2Tint, tgtCo2Tint, Math.min(1, dt * LERP_SPEED))

      const baseSunI = lerp(1.1, 2.75, dayFactor)
      sun.intensity = baseSunI * lv.sunIntensityMul
      sun.castShadow = elevation > -0.05
      const baseAmbI = lerp(0.52, 0.6, twilight)
      ambient.intensity = baseAmbI * lv.ambientTint
      fill.intensity = lerp(0.44, 0.5, twilight)

      sunColor.copy(DAWN_SUN).lerp(NOON_SUN, dayFactor)
      sun.color.copy(sunColor)

      bgColor.copy(NIGHT_BG).lerp(DAY_BG, twilight)
      if (Math.abs(lv.tempTint) > 0.01) {
        const tintColor = lv.tempTint < 0
          ? new THREE.Color('#2244ff')
          : new THREE.Color('#ff3322')
        bgColor.lerp(tintColor, Math.abs(lv.tempTint) * 0.15)
      }
      scene.background.copy(bgColor)

      if (lv.fogDensity > 0.0001) {
        if (!scene.fog) scene.fog = new THREE.FogExp2('#CC6633', lv.fogDensity)
        else { scene.fog.color.set('#CC6633'); scene.fog.density = lv.fogDensity }
      } else if (scene.fog) {
        scene.fog = null
      }

      updateCropsAndBeds(greenhouses, DOME_DEFS, ss, lv, dt)

      frameCount++; fpsAccum += dt
      if (now - lastFpsUpdate > 500) {
        const fps = Math.round(frameCount / fpsAccum)
        setHud(computeHud(sunPhase, fps, anim, camera, ss, events))
        frameCount = 0; fpsAccum = 0; lastFpsUpdate = now
      }

      if (anim.active) {
        anim.progress += dt / ANIM_DURATION
        if (anim.progress >= 1) {
          anim.progress = 1
          anim.active = false
        }
        const t = easeInOut(Math.min(anim.progress, 1))
        camera.zoom = lerp(anim.startZoom, anim.endZoom, t)
        camera.position.x = lerp(anim.startX, anim.endX, t)
        camera.position.z = lerp(anim.startZ, anim.endZ, t)
        camera.updateProjectionMatrix()

        if (anim.allMode) {
          for (const gh of greenhouses) {
            const shell = gh.getObjectByName('shell')
            const ribs = gh.getObjectByName('ribs')
            if (!shell) continue
            if (anim.entering) {
              shell.material.opacity = lerp(DOME_OPACITY, 0, t)
              if (ribs) ribs.visible = t < 0.3
              if (anim.progress >= 1) {
                shell.visible = false
                if (ribs) ribs.visible = false
                const interior = gh.getObjectByName('interior')
                if (interior) interior.visible = true
              }
            } else {
              shell.material.opacity = lerp(0, DOME_OPACITY, t)
              if (ribs) ribs.visible = t > 0.7
              if (anim.progress >= 1) {
                if (ribs) ribs.visible = true
              }
            }
          }
          if (anim.progress >= 1) {
            setInsideDome(anim.entering ? 'ALL' : null)
          }
        } else {
          const shell = anim.dome?.getObjectByName('shell')
          const ribs = anim.dome?.getObjectByName('ribs')
          if (shell) {
            if (anim.entering) {
              shell.material.opacity = lerp(DOME_OPACITY, 0, t)
              if (ribs) ribs.visible = t < 0.3
              if (anim.progress >= 1) {
                shell.visible = false
                if (ribs) ribs.visible = false
                const interior = anim.dome.getObjectByName('interior')
                if (interior) interior.visible = true
                setInsideDome(anim.dome.userData.domeId)
              }
            } else {
              shell.material.opacity = lerp(0, DOME_OPACITY, t)
              if (ribs) ribs.visible = t > 0.7
              if (anim.progress >= 1) {
                if (ribs) ribs.visible = true
                setInsideDome(null)
              }
            }
          }
        }
      }

      renderer.render(scene, camera)
    }
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      canvas.removeEventListener('click', onClick)
      window.removeEventListener('resize', onResize)
      cleanup()
    }
  }, [cleanup, domeDefs])

  const handleEnterDome = useCallback(() => {
    const s = stateRef.current
    if (!s || !enterLabel) return
    const { camera, anim } = s
    const domeGroup = enterLabel.group
    anim.active = true
    anim.entering = true
    anim.allMode = false
    anim.progress = 0
    anim.dome = domeGroup
    anim.startZoom = camera.zoom
    anim.endZoom = ZOOM_ENTERED
    anim.startX = camera.position.x
    anim.startZ = camera.position.z
    anim.endX = domeGroup.position.x
    anim.endZ = domeGroup.position.z

    const shell = domeGroup.getObjectByName('shell')
    if (shell) { shell.visible = true; shell.material.opacity = DOME_OPACITY }
    const ribs = domeGroup.getObjectByName('ribs')
    if (ribs) ribs.visible = true

    setEnterLabel(null)
  }, [enterLabel])

  const handleExitDome = useCallback(() => {
    const s = stateRef.current
    if (!s) return
    const { camera, anim, greenhouses } = s

    if (anim.allMode || insideDome === 'ALL') {
      for (const gh of greenhouses) {
        const shell = gh.getObjectByName('shell')
        if (shell) { shell.visible = true; shell.material.opacity = 0 }
        const ribs = gh.getObjectByName('ribs')
        if (ribs) ribs.visible = false
      }
      anim.active = true
      anim.entering = false
      anim.allMode = true
      anim.progress = 0
      anim.dome = null
      anim.startZoom = camera.zoom
      anim.endZoom = ZOOM_DEFAULT
      anim.startX = camera.position.x
      anim.startZ = camera.position.z
      anim.endX = 0
      anim.endZ = 0
      return
    }

    if (!anim.dome) return
    const shell = anim.dome.getObjectByName('shell')
    if (shell) { shell.visible = true; shell.material.opacity = 0 }
    const ribs = anim.dome.getObjectByName('ribs')
    if (ribs) ribs.visible = false

    anim.active = true
    anim.entering = false
    anim.allMode = false
    anim.progress = 0
    anim.startZoom = camera.zoom
    anim.endZoom = ZOOM_DEFAULT
    anim.startX = camera.position.x
    anim.startZ = camera.position.z
    anim.endX = 0
    anim.endZ = 0
  }, [insideDome])

  const handleExit = useCallback(() => {
    if (insideDome) {
      handleExitDome()
      return
    }
    onExit()
  }, [insideDome, handleExitDome, onExit])

  const handleEnterAll = useCallback(() => {
    const s = stateRef.current
    if (!s) return
    const { camera, anim, greenhouses } = s
    if (anim.active) return

    for (const gh of greenhouses) {
      const shell = gh.getObjectByName('shell')
      if (shell) { shell.visible = true; shell.material.opacity = DOME_OPACITY }
    }

    anim.active = true
    anim.entering = true
    anim.allMode = true
    anim.progress = 0
    anim.dome = null
    anim.startZoom = camera.zoom
    anim.endZoom = ZOOM_ALL
    anim.startX = camera.position.x
    anim.startZ = camera.position.z
    anim.endX = 0
    anim.endZ = 0

    setEnterLabel(null)
  }, [])

  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  useEffect(() => {
    if (isPlaying) {
      let lastFrac = simDayFracRef.current
      playIntervalRef.current = setInterval(() => {
        const curFrac = simDayFracRef.current
        if (curFrac < lastFrac) {
          setSimDay(prev => {
            if (prev >= totalDays) {
              setIsPlaying(false)
              return prev
            }
            return prev + 1
          })
          simulateTick()
        }
        lastFrac = curFrac
      }, 100)
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    }
    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current) }
  }, [isPlaying, totalDays, simulateTick])

  if (!domeDefs) {
    return (
      <div className="gh-overlay">
        <div className="gh-loading">
          <span className="gh-loading__spinner" />
          <span className="gh-loading__text">Loading colony data…</span>
        </div>
      </div>
    )
  }

  const waterPct = INITIAL_WATER > 0 ? hud.waterL / INITIAL_WATER : 1
  const nutrientPct = 200 > 0 ? hud.nutrientsKg / 200 : 1
  const barClass = (pct) => pct > 0.5 ? 'gh-bar--ok' : pct > 0.2 ? 'gh-bar--warn' : 'gh-bar--crit'

  return (
    <div className="gh-overlay">
      <canvas ref={canvasRef} className="gh-canvas" />

      <button className="gh-exit" onClick={handleExit}>
        ← {insideDome ? `Exit ${insideDome === 'ALL' ? 'All Domes' : insideDome}` : 'Exit'}
      </button>

      {!insideDome && (
        <button className="gh-enter-all" onClick={handleEnterAll}>
          ⬡ Enter All Domes
        </button>
      )}

      <div className="gh-date">
        <span className="gh-date-day">Sol {hud.missionDay || simDay}</span>
      </div>

      {enterLabel && !insideDome && (
        <button
          className="gh-enter-label"
          style={{ left: enterLabel.x, top: enterLabel.y }}
          onClick={handleEnterDome}
        >
          → ENTER {enterLabel.id}
        </button>
      )}

      <div className="gh-resources">
        <div className="gh-resources__row">
          <span className="gh-resources__label">Water</span>
          <div className="gh-resources__bar-track">
            <div
              className={`gh-resources__bar-fill ${barClass(waterPct)}`}
              style={{ width: `${Math.max(0, Math.min(100, waterPct * 100))}%` }}
            />
          </div>
          <span className="gh-resources__value">{Math.round(hud.waterL)}L</span>
        </div>
        <div className="gh-resources__row">
          <span className="gh-resources__label">Nutrients</span>
          <div className="gh-resources__bar-track">
            <div
              className={`gh-resources__bar-fill ${barClass(nutrientPct)}`}
              style={{ width: `${Math.max(0, Math.min(100, nutrientPct * 100))}%` }}
            />
          </div>
          <span className="gh-resources__value">{Math.round(hud.nutrientsKg)}kg</span>
        </div>
        <div className="gh-resources__row">
          <span className="gh-resources__label">Crops</span>
          <span className="gh-resources__value gh-resources__value--wide">
            {hud.cropsGrowing} growing / {hud.cropsReady} ready
            {hud.harvestedCount > 0 && ` / ${hud.harvestedCount} harvested`}
          </span>
        </div>

        <div className="gh-resources__env">
          <span className="gh-resources__env-item">{hud.tempC}°C</span>
          <span className="gh-resources__env-sep">·</span>
          <span className="gh-resources__env-item">{hud.co2Ppm}ppm</span>
          <span className="gh-resources__env-sep">·</span>
          <span className="gh-resources__env-item">{hud.humidityPct}%RH</span>
          <span className="gh-resources__env-sep">·</span>
          <span className="gh-resources__env-item">{hud.lightHours}h light</span>
        </div>

        {Object.keys(hud.cropBreakdown).length > 0 && (
          <div className="gh-resources__crop-breakdown">
            {Object.entries(hud.cropBreakdown).map(([name, count]) => (
              <span key={name} className="gh-resources__crop-chip">
                {name}: {count}
              </span>
            ))}
          </div>
        )}

        {hud.activeEvents.length > 0 && (
          <div className="gh-resources__events">
            {hud.activeEvents.map(ev => (
              <span key={ev} className="gh-resources__event-tag">{ev.replace(/_/g, ' ')}</span>
            ))}
          </div>
        )}

      </div>

      <div className="gh-timeline">
        <button
          className="gh-timeline-play"
          onClick={() => setIsPlaying(p => !p)}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <div className="gh-timeline-track">
          <span className="gh-timeline-label">Sol 1</span>
          <input
            type="range"
            className="gh-timeline-slider"
            min={1}
            max={totalDays}
            value={simDay}
            onChange={e => {
              setSimDay(Number(e.target.value))
              simDayFracRef.current = 0
            }}
            onMouseUp={e => {
              const target = Number(e.target.value)
              const current = simStateRef.current?.mission_day || 1
              if (target > current) {
                const ticksNeeded = target - current
                const runTicks = async () => {
                  for (let i = 0; i < ticksNeeded; i++) {
                    await simulateTick()
                  }
                }
                runTicks()
              }
            }}
            onTouchEnd={e => {
              const target = Number(e.target.value)
              const current = simStateRef.current?.mission_day || 1
              if (target > current) {
                const ticksNeeded = target - current
                const runTicks = async () => {
                  for (let i = 0; i < ticksNeeded; i++) {
                    await simulateTick()
                  }
                }
                runTicks()
              }
            }}
          />
          <span className="gh-timeline-label">Sol {totalDays}</span>
        </div>
      </div>
    </div>
  )
}
