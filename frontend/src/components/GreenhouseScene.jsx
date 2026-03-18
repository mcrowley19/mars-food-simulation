import { useRef, useEffect, useState, useCallback } from 'react'
import * as THREE from 'three'
import './GreenhouseScene.css'

/* ═══════════════════════════════════════════════════════════
   MARS COLONY — bird's-eye multi-dome greenhouse scene
   ═══════════════════════════════════════════════════════════ */

const FRUSTUM = 28
const DOME_OPACITY = 0.4
const ZOOM_DEFAULT = 1.0
const ZOOM_ENTERED = 2.8
const ZOOM_ALL = 1.15
const ANIM_DURATION = 1.2 // seconds

/* ───────────────────── helpers ───────────────────────────── */

function radToDeg(r) { return ((r * 180) / Math.PI) % 360 }
function compassDir(deg) {
  const d = ['N','NE','E','SE','S','SW','W','NW']
  return d[Math.round(((deg % 360) + 360) % 360 / 45) % 8]
}
function lerp(a, b, t) { return a + (b - a) * t }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 }

/* ── Colony layout — positions + radii for 7 domes ──────── */
const DOME_DEFS = [
  { id: 'DOME_01', x:  0,   z:  0,   r: 6   },
  { id: 'DOME_02', x: -11,  z: -3,   r: 4.5 },
  { id: 'DOME_03', x:  10,  z: -5,   r: 5   },
  { id: 'DOME_04', x: -5,   z:  10,  r: 3.5 },
  { id: 'DOME_05', x:  7,   z:  8,   r: 4   },
  { id: 'DOME_06', x: -13,  z:  7,   r: 3   },
  { id: 'DOME_07', x:  15,  z:  4,   r: 3.5 },
]

// Pairs of domes to connect with tunnels
const TUNNELS = [
  ['DOME_01', 'DOME_02'],
  ['DOME_01', 'DOME_03'],
  ['DOME_01', 'DOME_04'],
  ['DOME_01', 'DOME_05'],
  ['DOME_04', 'DOME_06'],
  ['DOME_03', 'DOME_07'],
]

/* ═════════════════ scene construction ══════════════════════ */

function initScene(canvas, w, h) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
  })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#1a0a04')

  const aspect = w / h
  const camera = new THREE.OrthographicCamera(
    -FRUSTUM * aspect, FRUSTUM * aspect,
    FRUSTUM, -FRUSTUM, 0.1, 200
  )
  camera.position.set(0, 60, 0)
  camera.lookAt(0, 0, 0)
  camera.zoom = ZOOM_DEFAULT
  camera.updateProjectionMatrix()

  return { renderer, scene, camera }
}

/* ── terrain ──────────────────────────────────────────────── */

function buildTerrain(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: '#c1440e', roughness: 0.95 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // scattered rocks
  const rockGeo = new THREE.DodecahedronGeometry(0.3, 0)
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8b3a0f', roughness: 1 })
  const spots = [
    [-18,0.15,-14],[16,0.12,12],[-9,0.1,17],[14,0.14,-16],
    [-20,0.1,5],[6,0.13,-19],[22,0.1,-8],[-15,0.12,14],
  ]
  for (const [x,y,z] of spots) {
    const r = new THREE.Mesh(rockGeo, rockMat)
    r.position.set(x, y, z)
    r.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0)
    r.scale.setScalar(0.5 + Math.random() * 1.8)
    r.castShadow = true
    scene.add(r)
  }
}

/* ── single dome builder ─────────────────────────────────── */

function buildSingleDome(def) {
  const { id, r } = def
  const group = new THREE.Group()
  group.userData.domeId = id
  group.userData.radius = r

  // shared rib material
  const ribMat = new THREE.MeshStandardMaterial({ color: '#aaaaaa', roughness: 0.4, metalness: 0.6 })

  // ── glass dome shell ──
  const domeMat = new THREE.MeshPhysicalMaterial({
    color: '#88ccbb', transparent: true, opacity: DOME_OPACITY,
    roughness: 0.1, transmission: 0.5, thickness: 0.3,
    side: THREE.DoubleSide, depthWrite: false,
  })
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(r, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    domeMat
  )
  shell.castShadow = true
  shell.name = 'shell'
  group.add(shell)

  // ── horizontal ribs ──
  for (const deg of [15, 35, 55, 75]) {
    const a = (deg * Math.PI) / 180
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(r * Math.sin(a), 0.05, 8, 48),
      ribMat
    )
    rib.position.y = r * Math.cos(a)
    rib.rotation.x = Math.PI / 2
    rib.castShadow = true
    group.add(rib)
  }

  // ── vertical meridian ribs ──
  for (let i = 0; i < 8; i++) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.05, 8, 48, Math.PI / 2),
      ribMat
    )
    rib.rotation.set(0, (i / 8) * Math.PI * 2, 0)
    rib.castShadow = true
    group.add(rib)
  }

  // ── base ring ──
  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(r, 0.1, 12, 48), ribMat
  )
  baseRing.rotation.x = Math.PI / 2
  baseRing.position.y = 0.01
  baseRing.castShadow = true
  group.add(baseRing)

  // ── airlock ──
  const alockMat = new THREE.MeshPhysicalMaterial({
    color: '#88ccbb', transparent: true, opacity: 0.35,
    roughness: 0.15, side: THREE.DoubleSide, depthWrite: false,
  })
  const airlock = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.18, r * 0.18, r * 0.4, 16, 1, false, 0, Math.PI),
    alockMat
  )
  airlock.position.set(0, r * 0.2, r + r * 0.12)
  airlock.rotation.y = Math.PI / 2
  airlock.castShadow = true
  group.add(airlock)

  // ── interior (hidden by default) ──
  const interior = buildDomeInterior(r)
  interior.visible = false
  interior.name = 'interior'
  group.add(interior)

  return group
}

/* ── dome interior: crop beds, hub, paths, equipment ─────── */

function buildDomeInterior(radius) {
  const g = new THREE.Group()

  // ── floor slab ──
  const floorMat = new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 0.9 })
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.92, 48), floorMat
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.01
  floor.receiveShadow = true
  g.add(floor)

  // ── crop bed material ──
  const bedMat = new THREE.MeshStandardMaterial({
    color: '#1a3d1a', emissive: '#00ff66', emissiveIntensity: 0.3, roughness: 0.8,
  })
  const soilMat = new THREE.MeshStandardMaterial({
    color: '#2d1a0a', roughness: 1,
  })
  const plantMat = new THREE.MeshStandardMaterial({
    color: '#22aa44', emissive: '#00ff44', emissiveIntensity: 0.25, roughness: 0.7,
  })

  // ── radial crop bed rows ──
  const bedH = 0.18
  const ringCount = radius > 4 ? 3 : 2
  for (let ring = 1; ring <= ringCount; ring++) {
    const ringR = radius * (0.25 + ring * 0.2)
    const bedCount = Math.floor(ring * 4 + 2)
    for (let i = 0; i < bedCount; i++) {
      const angle = (i / bedCount) * Math.PI * 2
      // skip beds near airlock zone (positive z)
      if (Math.abs(angle - Math.PI / 2) < 0.4) continue
      const bx = Math.cos(angle) * ringR
      const bz = Math.sin(angle) * ringR
      if (Math.sqrt(bx * bx + bz * bz) > radius * 0.82) continue

      const bedW = radius * 0.12
      const bedD = radius * 0.18

      // raised bed container
      const bed = new THREE.Mesh(
        new THREE.BoxGeometry(bedW, bedH, bedD), bedMat
      )
      bed.position.set(bx, bedH / 2 + 0.02, bz)
      bed.rotation.y = angle
      bed.receiveShadow = true
      bed.castShadow = true
      g.add(bed)

      // soil top
      const soil = new THREE.Mesh(
        new THREE.BoxGeometry(bedW * 0.9, 0.04, bedD * 0.9), soilMat
      )
      soil.position.set(bx, bedH + 0.04, bz)
      soil.rotation.y = angle
      g.add(soil)

      // small plant clusters on each bed
      const plantCount = 2 + Math.floor(Math.random() * 2)
      for (let p = 0; p < plantCount; p++) {
        const px = (Math.random() - 0.5) * bedW * 0.5
        const pz = (Math.random() - 0.5) * bedD * 0.5
        const ph = 0.08 + Math.random() * 0.15
        const plant = new THREE.Mesh(
          new THREE.SphereGeometry(ph, 6, 5), plantMat
        )
        const ca = Math.cos(angle), sa = Math.sin(angle)
        plant.position.set(
          bx + px * ca - pz * sa,
          bedH + 0.04 + ph,
          bz + px * sa + pz * ca
        )
        plant.scale.y = 1.3
        g.add(plant)
      }
    }
  }

  // ── central water/nutrient hub ──
  const hubMat = new THREE.MeshStandardMaterial({
    color: '#4488aa', emissive: '#225577', emissiveIntensity: 0.25, metalness: 0.6, roughness: 0.3,
  })
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.1, radius * 0.12, 0.6, 16), hubMat
  )
  hub.position.y = 0.3
  hub.castShadow = true
  g.add(hub)

  // hub ring glow
  const hubRing = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.13, 0.03, 8, 32),
    new THREE.MeshStandardMaterial({ color: '#66ddff', emissive: '#00aaff', emissiveIntensity: 0.5 })
  )
  hubRing.rotation.x = Math.PI / 2
  hubRing.position.y = 0.55
  g.add(hubRing)

  // ── water pipes radiating from hub ──
  const pipeMat = new THREE.MeshStandardMaterial({ color: '#5599bb', metalness: 0.5, roughness: 0.3 })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const pipeLen = radius * 0.65
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, pipeLen, 6), pipeMat
    )
    pipe.position.set(
      Math.cos(a) * pipeLen * 0.5,
      0.06,
      Math.sin(a) * pipeLen * 0.5
    )
    pipe.rotation.set(0, 0, Math.PI / 2)
    pipe.rotation.y = -a
    g.add(pipe)
  }

  // ── walking paths (cross + ring) ──
  const pathMat = new THREE.MeshStandardMaterial({ color: '#7a5533', roughness: 1 })
  const pathH = 0.03
  const cross1 = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 1.5, pathH, 0.22), pathMat
  )
  cross1.position.y = pathH / 2 + 0.01
  cross1.receiveShadow = true
  g.add(cross1)
  const cross2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, pathH, radius * 1.5), pathMat
  )
  cross2.position.y = pathH / 2 + 0.01
  cross2.receiveShadow = true
  g.add(cross2)

  // ring path around hub
  const ringPath = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.3, 0.1, 4, 32),
    pathMat
  )
  ringPath.rotation.x = Math.PI / 2
  ringPath.position.y = 0.02
  ringPath.receiveShadow = true
  g.add(ringPath)

  // ── workstation benches (2 small tables near hub) ──
  const benchMat = new THREE.MeshStandardMaterial({ color: '#888888', metalness: 0.4, roughness: 0.4 })
  for (const side of [-1, 1]) {
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 0.15, 0.25, radius * 0.08), benchMat
    )
    bench.position.set(side * radius * 0.25, 0.13, radius * 0.25)
    bench.castShadow = true
    g.add(bench)

    // small monitor on bench
    const monitor = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.12, 0.02),
      new THREE.MeshStandardMaterial({ color: '#111111', emissive: '#00bbff', emissiveIntensity: 0.6 })
    )
    monitor.position.set(side * radius * 0.25, 0.31, radius * 0.25)
    g.add(monitor)
  }

  // ── storage tanks along the edge ──
  const tankMat = new THREE.MeshStandardMaterial({ color: '#666666', metalness: 0.5, roughness: 0.3 })
  for (let i = 0; i < 4; i++) {
    const a = Math.PI + (i - 1.5) * 0.35
    const tx = Math.cos(a) * radius * 0.75
    const tz = Math.sin(a) * radius * 0.75
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.6, 8), tankMat
    )
    tank.position.set(tx, 0.3, tz)
    tank.castShadow = true
    g.add(tank)
  }

  return g
}

/* ── build the full colony ────────────────────────────────── */

function buildColony(scene) {
  const greenhouses = []
  const domeMap = {}

  for (const def of DOME_DEFS) {
    const dome = buildSingleDome(def)
    dome.position.set(def.x, 0, def.z)
    scene.add(dome)
    greenhouses.push(dome)
    domeMap[def.id] = { group: dome, def }
  }

  // ── tunnel corridors between dome pairs ──
  const tunnelMat = new THREE.MeshStandardMaterial({ color: '#999999', roughness: 0.3, metalness: 0.6 })
  for (const [idA, idB] of TUNNELS) {
    const a = domeMap[idA], b = domeMap[idB]
    if (!a || !b) continue
    const ax = a.def.x, az = a.def.z, ar = a.def.r
    const bx = b.def.x, bz = b.def.z, br = b.def.r
    const dx = bx - ax, dz = bz - az
    const dist = Math.sqrt(dx * dx + dz * dz)
    const angle = Math.atan2(dx, dz)
    // tunnel spans from edge of dome A to edge of dome B
    const tunnelLen = dist - ar - br
    if (tunnelLen <= 0) continue
    const cx = ax + dx * 0.5
    const cz = az + dz * 0.5
    const tunnel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, tunnelLen, 12),
      tunnelMat
    )
    tunnel.position.set(cx, 0.4, cz)
    tunnel.rotation.set(0, 0, Math.PI / 2)
    // align cylinder axis along the line between domes
    tunnel.rotation.set(0, angle, Math.PI / 2)
    tunnel.castShadow = true
    scene.add(tunnel)
  }

  return greenhouses
}

/* ── lighting ─────────────────────────────────────────────── */

function setupLighting(scene) {
  scene.add(new THREE.AmbientLight('#441a00', 0.3))

  const sun = new THREE.DirectionalLight('#ffe8cc', 2.0)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -40
  sun.shadow.camera.right = 40
  sun.shadow.camera.top = 40
  sun.shadow.camera.bottom = -40
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 120
  sun.shadow.bias = -0.001
  scene.add(sun)
  return sun
}

/* ═════════════════ React component ════════════════════════ */

export default function GreenhouseScene({ onExit }) {
  const canvasRef = useRef(null)
  const labelsRef = useRef(null)      // DOM container for dome labels
  const stateRef = useRef(null)
  const rafRef = useRef(null)
  const [hud, setHud] = useState({ angle: 0, dir: 'N', fps: 0, dome: '—', zoom: '1.0' })
  const [enterLabel, setEnterLabel] = useState(null)   // { id, x, y }
  const [insideDome, setInsideDome] = useState(null)

  /* ── cleanup ── */
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

  /* ── mount scene ── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const w = window.innerWidth, h = window.innerHeight
    const { renderer, scene, camera } = initScene(canvas, w, h)
    buildTerrain(scene)
    const greenhouses = buildColony(scene)
    const sun = setupLighting(scene)

    // raycaster for dome clicks
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    // animation state for enter/exit transitions
    const anim = {
      active: false,
      entering: false,   // true = zooming in, false = zooming out
      allMode: false,     // true = operating on ALL domes at once
      progress: 0,
      dome: null,         // dome group being targeted (single mode)
      startZoom: ZOOM_DEFAULT,
      endZoom: ZOOM_ENTERED,
      startX: 0, startZ: 0,
      endX: 0, endZ: 0,
    }

    stateRef.current = { renderer, scene, camera, sun, greenhouses, anim, raycaster, pointer }

    /* ── click handler ── */
    const onClick = (e) => {
      if (anim.active) return
      const rect = canvas.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)

      // test every dome shell
      const shells = greenhouses.map(g => g.getObjectByName('shell')).filter(Boolean)
      const hits = raycaster.intersectObjects(shells, false)
      if (hits.length > 0) {
        const domeGroup = hits[0].object.parent
        const domeId = domeGroup.userData.domeId
        // project dome centre to screen for label positioning
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

    /* ── resize ── */
    const onResize = () => {
      const nw = window.innerWidth, nh = window.innerHeight
      renderer.setSize(nw, nh)
      const a = nw / nh
      camera.left = -FRUSTUM * a; camera.right = FRUSTUM * a
      camera.top = FRUSTUM; camera.bottom = -FRUSTUM
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    /* ── animation loop ── */
    const SUN_RADIUS = 45, SUN_HEIGHT = 25, SUN_SPEED = 0.15
    let sunAngle = 0, lastTime = performance.now()
    let frameCount = 0, fpsAccum = 0, lastFpsUpdate = performance.now()

    const animate = (now) => {
      rafRef.current = requestAnimationFrame(animate)
      const dt = (now - lastTime) / 1000
      lastTime = now

      // ── fps / hud ──
      frameCount++; fpsAccum += dt
      if (now - lastFpsUpdate > 500) {
        const fps = Math.round(frameCount / fpsAccum)
        const angleDeg = radToDeg(sunAngle)
        setHud({
          angle: angleDeg.toFixed(1),
          dir: compassDir(angleDeg),
          fps,
          dome: anim.dome ? anim.dome.userData.domeId : '—',
          zoom: camera.zoom.toFixed(2),
        })
        frameCount = 0; fpsAccum = 0; lastFpsUpdate = now
      }

      // ── sun orbit ──
      sunAngle += SUN_SPEED * dt
      sun.position.set(Math.cos(sunAngle) * SUN_RADIUS, SUN_HEIGHT, Math.sin(sunAngle) * SUN_RADIUS)
      sun.target.position.set(0, 0, 0)
      sun.target.updateMatrixWorld()

      // ── enter/exit animation ──
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
          // fade ALL domes simultaneously
          for (const gh of greenhouses) {
            const shell = gh.getObjectByName('shell')
            if (!shell) continue
            if (anim.entering) {
              shell.material.opacity = lerp(DOME_OPACITY, 0, t)
              if (anim.progress >= 1) {
                shell.visible = false
                const interior = gh.getObjectByName('interior')
                if (interior) interior.visible = true
              }
            } else {
              shell.material.opacity = lerp(0, DOME_OPACITY, t)
              if (anim.progress >= 1) {
                const interior = gh.getObjectByName('interior')
                if (interior) interior.visible = false
              }
            }
          }
          if (anim.progress >= 1) {
            setInsideDome(anim.entering ? 'ALL' : null)
          }
        } else {
          // single dome
          const shell = anim.dome?.getObjectByName('shell')
          if (shell) {
            if (anim.entering) {
              shell.material.opacity = lerp(DOME_OPACITY, 0, t)
              if (anim.progress >= 1) {
                shell.visible = false
                const interior = anim.dome.getObjectByName('interior')
                if (interior) interior.visible = true
                setInsideDome(anim.dome.userData.domeId)
              }
            } else {
              shell.material.opacity = lerp(0, DOME_OPACITY, t)
              if (anim.progress >= 1) {
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
  }, [cleanup])

  /* ── enter dome action (single) ── */
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

    setEnterLabel(null)
  }, [enterLabel])

  /* ── exit dome action (single) ── */
  const handleExitDome = useCallback(() => {
    const s = stateRef.current
    if (!s) return
    const { camera, anim, greenhouses } = s

    if (anim.allMode || insideDome === 'ALL') {
      // exit all domes
      for (const gh of greenhouses) {
        const interior = gh.getObjectByName('interior')
        if (interior) interior.visible = false
        const shell = gh.getObjectByName('shell')
        if (shell) { shell.visible = true; shell.material.opacity = 0 }
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
    const interior = anim.dome.getObjectByName('interior')
    if (interior) interior.visible = false
    const shell = anim.dome.getObjectByName('shell')
    if (shell) { shell.visible = true; shell.material.opacity = 0 }

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

  /* ── enter ALL domes at once ── */
  const handleEnterAll = useCallback(() => {
    const s = stateRef.current
    if (!s) return
    const { camera, anim, greenhouses } = s
    if (anim.active) return

    // reset all shells to visible
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

  return (
    <div className="gh-overlay">
      <canvas ref={canvasRef} className="gh-canvas" />

      {/* ── HUD ── */}
      <div className="gh-hud">
        <span className="gh-hud-label">SUN</span>
        <span className="gh-hud-value">{hud.angle}°</span>
        <span className="gh-hud-label">DIR</span>
        <span className="gh-hud-value">{hud.dir}</span>
        <span className="gh-hud-label">DOME</span>
        <span className="gh-hud-value">{hud.dome}</span>
        <span className="gh-hud-label">ZOOM</span>
        <span className="gh-hud-value">{hud.zoom}×</span>
        <span className="gh-hud-label">FPS</span>
        <span className="gh-hud-value">{hud.fps}</span>
      </div>

      {/* ── scene exit ── */}
      <button className="gh-exit" onClick={onExit}>← Exit</button>

      {/* ── enter ALL domes button ── */}
      {!insideDome && (
        <button className="gh-enter-all" onClick={handleEnterAll}>
          ⬡ Enter All Domes
        </button>
      )}

      {/* ── enter single dome label ── */}
      {enterLabel && !insideDome && (
        <button
          className="gh-enter-label"
          style={{ left: enterLabel.x, top: enterLabel.y }}
          onClick={handleEnterDome}
        >
          → ENTER {enterLabel.id}
        </button>
      )}

      {/* ── exit-dome button ── */}
      {insideDome && (
        <button className="gh-exit-dome" onClick={handleExitDome}>
          ← Exit {insideDome === 'ALL' ? 'All Domes' : insideDome}
        </button>
      )}
    </div>
  )
}
