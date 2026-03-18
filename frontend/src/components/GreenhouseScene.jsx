import { useRef, useEffect, useState, useCallback } from 'react'
import * as THREE from 'three'
import useGreenhouseState from '../hooks/useGreenhouseState'
import './GreenhouseScene.css'

/* ═══════════════════════════════════════════════════════════
   MARS COLONY — bird's-eye multi-dome greenhouse scene
   ═══════════════════════════════════════════════════════════ */

const FRUSTUM = 80
const DOME_OPACITY = 0.4
const ZOOM_DEFAULT = 1.0
const ZOOM_ENTERED = 2.0
const ZOOM_ALL = 1.05
const ANIM_DURATION = 1.2 // seconds

/* ───────────────────── helpers ───────────────────────────── */

function radToDeg(r) { return ((r * 180) / Math.PI) % 360 }
function compassDir(deg) {
  const d = ['N','NE','E','SE','S','SW','W','NW']
  return d[Math.round(((deg % 360) + 360) % 360 / 45) % 8]
}
function lerp(a, b, t) { return a + (b - a) * t }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 }

const CROP_COLORS = {
  lettuce: '#33cc55', potato: '#8B7355', wheat: '#DAA520', tomato: '#FF6347',
  soybean: '#9ACD32', spinach: '#33cc55', radish: '#FF4500', pea: '#90EE90',
  kale: '#228B22', carrot: '#FF8C00',
}
const CROP_EMPTY_COLOR = '#3a2a1e'
const CROP_DEAD_COLOR  = '#8B4513'
const CROP_HARVEST_EMISSIVE = '#FFD700'
const INITIAL_WATER = 4800

/* ── Colony layout — positions + base radii for 7 domes ── */
const DOME_DEFS_BASE = [
  { id: 'DOME_01', x:  0,   z:  0,   r: 24  },
  { id: 'DOME_02', x: -48,  z: -14,  r: 18  },
  { id: 'DOME_03', x:  44,  z: -20,  r: 20  },
  { id: 'DOME_04', x: -20,  z:  42,  r: 15  },
  { id: 'DOME_05', x:  28,  z:  36,  r: 16  },
  { id: 'DOME_06', x: -55,  z:  28,  r: 12  },
  { id: 'DOME_07', x:  62,  z:  16,  r: 14  },
]

const MIN_DOME_R = 8
const MAX_DOME_R = 35

function scaleDomeDefs(floorSpaceM2) {
  const baseRadii = DOME_DEFS_BASE.map(d => d.r)
  const baseAreas = baseRadii.map(r => Math.PI * r * r)
  const totalBaseArea = baseAreas.reduce((a, b) => a + b, 0)
  return DOME_DEFS_BASE.map((def, i) => {
    const share = (baseAreas[i] / totalBaseArea) * floorSpaceM2
    const raw = Math.sqrt(share / Math.PI)
    const clamped = Math.max(MIN_DOME_R, Math.min(MAX_DOME_R, raw))
    return { ...def, r: clamped }
  })
}

/* Fallback: use base radii as-is */
let DOME_DEFS = DOME_DEFS_BASE

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
  camera.position.set(0, 160, 0)
  camera.lookAt(0, 0, 0)
  camera.zoom = ZOOM_DEFAULT
  camera.updateProjectionMatrix()

  return { renderer, scene, camera }
}

/* ── terrain ──────────────────────────────────────────────── */

function buildTerrain(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: '#c1440e', roughness: 0.95 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)
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
    new THREE.SphereGeometry(r, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2),
    domeMat
  )
  shell.castShadow = true
  shell.name = 'shell'
  group.add(shell)

  // ── structural ribs (in a named group for toggling) ──
  const ribs = new THREE.Group()
  ribs.name = 'ribs'

  // horizontal ribs
  for (const deg of [12, 28, 44, 60, 76]) {
    const a = (deg * Math.PI) / 180
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(r * Math.sin(a), 0.06, 8, 64),
      ribMat
    )
    rib.position.y = r * Math.cos(a)
    rib.rotation.x = Math.PI / 2
    rib.castShadow = true
    ribs.add(rib)
  }

  // vertical meridian ribs
  for (let i = 0; i < 12; i++) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.06, 8, 64, Math.PI / 2),
      ribMat
    )
    rib.rotation.set(0, (i / 12) * Math.PI * 2, 0)
    rib.castShadow = true
    ribs.add(rib)
  }

  // base ring
  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(r, 0.14, 12, 64), ribMat
  )
  baseRing.rotation.x = Math.PI / 2
  baseRing.position.y = 0.01
  baseRing.castShadow = true
  ribs.add(baseRing)

  group.add(ribs)

  // ── foundation ring (stays visible) ──
  const foundMat = new THREE.MeshStandardMaterial({ color: '#666666', roughness: 0.5, metalness: 0.4 })
  const foundation = new THREE.Mesh(
    new THREE.TorusGeometry(r + 0.3, 0.3, 8, 64), foundMat
  )
  foundation.rotation.x = Math.PI / 2
  foundation.position.y = -0.05
  foundation.receiveShadow = true
  group.add(foundation)

  // ── airlock ──
  const alockMat = new THREE.MeshPhysicalMaterial({
    color: '#88ccbb', transparent: true, opacity: 0.35,
    roughness: 0.15, side: THREE.DoubleSide, depthWrite: false,
  })
  const airlock = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.16, r * 0.16, r * 0.35, 16, 1, false, 0, Math.PI),
    alockMat
  )
  airlock.position.set(0, r * 0.18, r + r * 0.1)
  airlock.rotation.y = Math.PI / 2
  airlock.castShadow = true
  group.add(airlock)

  // ── exterior lights at base ──
  const lightMat = new THREE.MeshStandardMaterial({
    color: '#ffcc66', emissive: '#ffaa33', emissiveIntensity: 0.8,
  })
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 6, 4), lightMat
    )
    light.position.set(Math.cos(a) * (r + 0.5), 0.4, Math.sin(a) * (r + 0.5))
    group.add(light)
  }

  // ── interior (hidden by default) ──
  const { group: interiorGroup, plantMeshes, waterPoolMat } = buildDomeInterior(r)
  interiorGroup.visible = false
  interiorGroup.name = 'interior'
  group.add(interiorGroup)

  group.userData.plantMeshes = plantMeshes
  group.userData.waterPoolMat = waterPoolMat
  group.userData.shellMat = domeMat

  return group
}

/* ── dome interior: crop beds, hub, paths, equipment ─────── */

function buildDomeInterior(radius) {
  const g = new THREE.Group()

  /* ── shared materials — clean space-station palette ────── */
  const floorMat = new THREE.MeshStandardMaterial({ color: '#2a2a30', roughness: 0.4, metalness: 0.3 })
  const panelMat = new THREE.MeshStandardMaterial({ color: '#3a3a42', roughness: 0.3, metalness: 0.5 })
  const accentMat = new THREE.MeshStandardMaterial({
    color: '#00ccff', emissive: '#0088cc', emissiveIntensity: 0.5,
  })
  const warmAccent = new THREE.MeshStandardMaterial({
    color: '#ff8844', emissive: '#cc5522', emissiveIntensity: 0.4,
  })
  const metalMat = new THREE.MeshStandardMaterial({ color: '#888890', metalness: 0.7, roughness: 0.25 })
  const darkMat = new THREE.MeshStandardMaterial({ color: '#1a1a1e', roughness: 0.5, metalness: 0.4 })

  /* ── floor: clean circular platform with grid lines ───── */
  const floor = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.95, 64), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.01
  floor.receiveShadow = true
  g.add(floor)

  // concentric floor guide rings (glowing cyan)
  const ringLineMat = new THREE.MeshStandardMaterial({
    color: '#004466', emissive: '#003355', emissiveIntensity: 0.4,
  })
  for (let ri = 1; ri <= 4; ri++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * (ri * 0.2), 0.03, 4, 96), ringLineMat
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.02
    g.add(ring)
  }

  // radial floor lines (8 spokes)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const line = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.8, 0.02, 0.04), ringLineMat)
    line.position.y = 0.02
    line.rotation.y = a
    g.add(line)
  }

  /* ── uniform hydroponics bays (wedge sectors) ─────────── */
  const bayCount = 8
  const bedMat = new THREE.MeshStandardMaterial({ color: '#1e2e1e', roughness: 0.6, metalness: 0.3 })
  const soilMat = new THREE.MeshStandardMaterial({ color: '#1a1a10', roughness: 0.8 })
  const plantMeshes = []
  const plantBaseRadius = []
  const plantGeom = new THREE.SphereGeometry(1, 8, 6)

  for (let bay = 0; bay < bayCount; bay++) {
    const angle = (bay / bayCount) * Math.PI * 2
    if (Math.abs(angle - Math.PI / 2) < 0.5) continue

    for (let row = 0; row < 2; row++) {
      const rowR = radius * (0.35 + row * 0.28)
      const bx = Math.cos(angle) * rowR
      const bz = Math.sin(angle) * rowR
      if (Math.sqrt(bx * bx + bz * bz) > radius * 0.88) continue

      const bedW = radius * 0.14
      const bedD = radius * 0.08
      const bedH = 0.35

      const container = new THREE.Mesh(new THREE.BoxGeometry(bedW, bedH, bedD), panelMat)
      container.position.set(bx, bedH / 2 + 0.02, bz)
      container.rotation.y = angle
      container.receiveShadow = true
      container.castShadow = true
      g.add(container)

      const soil = new THREE.Mesh(new THREE.BoxGeometry(bedW * 0.88, 0.04, bedD * 0.88), soilMat)
      soil.position.set(bx, bedH + 0.04, bz)
      soil.rotation.y = angle
      g.add(soil)

      const ca = Math.cos(angle), sa = Math.sin(angle)
      const plantSpacing = bedW / 5
      for (let p = -2; p <= 2; p++) {
        const ox = p * plantSpacing * 0.8
        const ph = 0.12 + (row * 0.05)
        const mat = new THREE.MeshStandardMaterial({
          color: CROP_EMPTY_COLOR, emissive: '#000000', emissiveIntensity: 0, roughness: 0.6,
        })
        const plant = new THREE.Mesh(plantGeom, mat)
        plant.position.set(bx + ox * ca, bedH + 0.04 + ph, bz + ox * sa)
        plant.scale.set(ph, ph * 1.3, ph)
        plant.userData.isPlant = true
        plant.userData.baseScale = ph
        g.add(plant)
        plantMeshes.push(plant)
        plantBaseRadius.push(ph)
      }

      const ledMat = new THREE.MeshStandardMaterial({
        color: '#cc88ff', emissive: '#aa44ee', emissiveIntensity: 0.8,
        transparent: true, opacity: 0.7,
      })
      const led = new THREE.Mesh(new THREE.BoxGeometry(bedW, 0.04, 0.06), ledMat)
      led.position.set(bx, radius * 0.28, bz)
      led.rotation.y = angle
      g.add(led)
      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, radius * 0.27, 4), metalMat
      )
      strut.position.set(bx, radius * 0.14, bz)
      g.add(strut)
    }
  }

  /* ── central command hub ──────────────────────────────── */
  // base platform (octagonal feel)
  const hubR = radius * 0.15
  const hubBase = new THREE.Mesh(
    new THREE.CylinderGeometry(hubR, hubR * 1.1, 0.15, 8), panelMat
  )
  hubBase.position.y = 0.08
  hubBase.castShadow = true
  g.add(hubBase)

  // holographic table
  const tableMat = new THREE.MeshStandardMaterial({
    color: '#222228', metalness: 0.6, roughness: 0.2,
  })
  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(hubR * 0.7, hubR * 0.7, 0.08, 16), tableMat
  )
  table.position.y = 0.5
  table.castShadow = true
  g.add(table)
  // table pedestal
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(hubR * 0.15, hubR * 0.2, 0.4, 8), metalMat
  )
  pedestal.position.y = 0.35
  g.add(pedestal)

  // hologram glow disc
  const holoMat = new THREE.MeshStandardMaterial({
    color: '#00ffcc', emissive: '#00ddaa', emissiveIntensity: 0.9,
    transparent: true, opacity: 0.3,
  })
  const holo = new THREE.Mesh(
    new THREE.CylinderGeometry(hubR * 0.5, hubR * 0.5, 0.02, 32), holoMat
  )
  holo.position.y = 0.56
  g.add(holo)

  // ring of status screens around hub
  const screenMat = new THREE.MeshStandardMaterial({
    color: '#0a0a12', emissive: '#0088ff', emissiveIntensity: 0.7,
  })
  for (let i = 0; i < 6; i++) {
    const sa = (i / 6) * Math.PI * 2
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.04), screenMat)
    screen.position.set(Math.cos(sa) * hubR * 1.2, 0.45, Math.sin(sa) * hubR * 1.2)
    screen.rotation.y = sa + Math.PI
    g.add(screen)
  }

  /* ── perimeter walkway (raised ring) ──────────────────── */
  const walkR = radius * 0.82
  const walkway = new THREE.Mesh(
    new THREE.TorusGeometry(walkR, 0.2, 6, 96), panelMat
  )
  walkway.rotation.x = Math.PI / 2
  walkway.position.y = 0.03
  g.add(walkway)

  // inner walkway ring
  const innerWalk = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.48, 0.15, 6, 64), panelMat
  )
  innerWalk.rotation.x = Math.PI / 2
  innerWalk.position.y = 0.03
  g.add(innerWalk)

  /* ── connecting pathways (4 main corridors) ───────────── */
  const pathMat = new THREE.MeshStandardMaterial({ color: '#333338', roughness: 0.35, metalness: 0.3 })
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const path = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.6, 0.05, 0.5), pathMat)
    path.position.y = 0.025
    path.rotation.y = a
    path.receiveShadow = true
    g.add(path)
  }

  // path edge lighting strips
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    for (const offset of [-0.28, 0.28]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 1.5, 0.02, 0.05), accentMat
      )
      strip.position.y = 0.035
      strip.rotation.y = a
      // offset perpendicular to path direction
      strip.position.x = Math.sin(a) * offset
      strip.position.z = -Math.cos(a) * offset
      g.add(strip)
    }
  }

  /* ── equipment stations (evenly spaced around perimeter) ─ */
  const stationCount = 6
  for (let i = 0; i < stationCount; i++) {
    const a = (i / stationCount) * Math.PI * 2
    if (Math.abs(a - Math.PI / 2) < 0.4) continue // skip airlock side
    const sx = Math.cos(a) * (radius * 0.75)
    const sz = Math.sin(a) * (radius * 0.75)

    // console unit
    const console = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.5), darkMat)
    console.position.set(sx, 0.35, sz)
    console.rotation.y = a + Math.PI
    console.castShadow = true
    g.add(console)
    // screen
    const scr = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.03), screenMat)
    scr.position.set(sx, 0.65, sz)
    scr.rotation.y = a + Math.PI
    g.add(scr)
    // status indicator
    const indicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 4),
      i % 2 === 0 ? accentMat : warmAccent
    )
    indicator.position.set(sx + Math.cos(a + Math.PI) * 0.4, 0.75, sz + Math.sin(a + Math.PI) * 0.4)
    g.add(indicator)
  }

  /* ── life support columns (4 pillars) ─────────────────── */
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 8
    const px = Math.cos(a) * radius * 0.6
    const pz = Math.sin(a) * radius * 0.6

    // main column
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.25, radius * 0.4, 8), metalMat
    )
    col.position.set(px, radius * 0.2, pz)
    col.castShadow = true
    g.add(col)

    // glowing ring at top
    const colRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.04, 6, 16), accentMat
    )
    colRing.rotation.x = Math.PI / 2
    colRing.position.set(px, radius * 0.4, pz)
    g.add(colRing)

    // glowing ring at base
    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.04, 6, 16), accentMat
    )
    baseRing.rotation.x = Math.PI / 2
    baseRing.position.set(px, 0.05, pz)
    g.add(baseRing)
  }

  /* ── storage bays along back edge ─────────────────────── */
  const tankCount = Math.max(8, Math.floor(radius * 0.5))
  for (let i = 0; i < tankCount; i++) {
    const a = Math.PI + ((i - (tankCount - 1) / 2) / tankCount) * Math.PI * 1.2
    const tx = Math.cos(a) * radius * 0.82
    const tz = Math.sin(a) * radius * 0.82

    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 1.0, 8), metalMat
    )
    tank.position.set(tx, 0.5, tz)
    tank.castShadow = true
    g.add(tank)
    // accent band
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.03, 4, 12), warmAccent
    )
    band.rotation.x = Math.PI / 2
    band.position.set(tx, 0.7, tz)
    g.add(band)
  }

  /* ── water reclamation unit (near centre) ─────────────── */
  const waterMat = new THREE.MeshStandardMaterial({
    color: '#112244', emissive: '#0055aa', emissiveIntensity: 0.3,
    transparent: true, opacity: 0.5,
  })
  const pool = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.12, radius * 0.13, 0.12, 24), waterMat
  )
  pool.position.set(radius * 0.28, 0.06, -radius * 0.22)
  pool.userData.isWaterPool = true
  g.add(pool)
  const poolRim = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.125, 0.05, 6, 24), metalMat
  )
  poolRim.rotation.x = Math.PI / 2
  poolRim.position.set(radius * 0.28, 0.12, -radius * 0.22)
  g.add(poolRim)

  /* ── radial utility conduits ──────────────────────────── */
  const conduitMat = new THREE.MeshStandardMaterial({ color: '#556675', metalness: 0.5, roughness: 0.3 })
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const pipeLen = radius * 0.7
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, pipeLen, 6), conduitMat
    )
    pipe.position.set(Math.cos(a) * pipeLen * 0.5, 0.1, Math.sin(a) * pipeLen * 0.5)
    pipe.rotation.set(0, 0, Math.PI / 2)
    pipe.rotation.y = -a
    g.add(pipe)
  }

  return { group: g, plantMeshes, waterPoolMat: waterMat }
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
      new THREE.CylinderGeometry(1.6, 1.6, tunnelLen, 16),
      tunnelMat
    )
    tunnel.position.set(cx, 1.6, cz)
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
  const ambient = new THREE.AmbientLight('#441a00', 0.35)
  scene.add(ambient)

  const fill = new THREE.DirectionalLight('#ff8844', 0.3)
  fill.position.set(0, -10, 0)
  scene.add(fill)

  const sun = new THREE.DirectionalLight('#ffe8cc', 2.2)
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)
  sun.shadow.camera.left = -120
  sun.shadow.camera.right = 120
  sun.shadow.camera.top = 120
  sun.shadow.camera.bottom = -120
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 300
  sun.shadow.bias = -0.0005
  scene.add(sun)
  return { sun, ambient, fill }
}

/* ═══════════════ crop distribution helpers ════════════════ */

function distributeCrops(crops, domeDefsArr) {
  if (!crops || !crops.length || !domeDefsArr) return domeDefsArr.map(() => [])
  const areas = domeDefsArr.map(d => Math.PI * d.r * d.r)
  const totalArea = areas.reduce((a, b) => a + b, 0)
  const result = domeDefsArr.map(() => [])
  let assigned = 0
  const counts = domeDefsArr.map((_, i) => {
    const c = Math.floor(crops.length * (areas[i] / totalArea))
    assigned += c
    return c
  })
  let remainder = crops.length - assigned
  for (let i = 0; i < domeDefsArr.length && remainder > 0; i++) {
    counts[i]++
    remainder--
  }
  let idx = 0
  for (let i = 0; i < domeDefsArr.length; i++) {
    result[i] = crops.slice(idx, idx + counts[i])
    idx += counts[i]
  }
  return result
}

/* ═════════════════ React component ════════════════════════ */

export default function GreenhouseScene({ onExit, totalDays = 350 }) {
  const canvasRef = useRef(null)
  const labelsRef = useRef(null)
  const stateRef = useRef(null)
  const rafRef = useRef(null)
  const [hud, setHud] = useState({
    angle: 0, dir: 'N', fps: 0, dome: '—', zoom: '1.0',
    missionDay: 0, waterL: 0, nutrientsKg: 0,
    cropsGrowing: 0, cropsReady: 0, activeEvents: [],
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

  const lerpedRef = useRef({
    sunIntensityMul: 1.0,
    ambientTint: 1.0,
    tempTint: 0,
    fogDensity: 0,
    plantScales: [],
    waterFault: 0,
    co2Tint: 0,
  })

  useEffect(() => { simStateRef.current = simState }, [simState])

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

  /* ── mount scene (waits for dome radii) ── */
  useEffect(() => {
    if (!domeDefs) return
    const canvas = canvasRef.current
    if (!canvas) return

    const w = window.innerWidth, h = window.innerHeight
    const { renderer, scene, camera } = initScene(canvas, w, h)
    buildTerrain(scene)
    const greenhouses = buildColony(scene)
    const { sun, ambient, fill } = setupLighting(scene)

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

    stateRef.current = { renderer, scene, camera, sun, ambient, fill, greenhouses, anim, raycaster, pointer }

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

      // ── targets from backend state ──
      const tgtSunMul = typeof env.light_intensity === 'number' ? env.light_intensity : 1.0
      const tgtAmbientTint = typeof env.light_hours === 'number' ? Math.min(1, env.light_hours / 16) : 1.0
      const tgtTempTint = typeof env.temp_c === 'number'
        ? (env.temp_c < 15 ? -(15 - env.temp_c) / 15 : env.temp_c > 30 ? (env.temp_c - 30) / 20 : 0)
        : 0
      const tgtFogDensity = events.includes('dust_storm') ? 0.008 : 0
      const tgtWaterFault = events.includes('water_recycler_fault') ? 1 : 0
      const tgtCo2Tint = events.includes('co2_spike') ? 1 : 0

      lv.sunIntensityMul = lerp(lv.sunIntensityMul, tgtSunMul, Math.min(1, dt * LERP_SPEED))
      lv.ambientTint = lerp(lv.ambientTint, tgtAmbientTint, Math.min(1, dt * LERP_SPEED))
      lv.tempTint = lerp(lv.tempTint, tgtTempTint, Math.min(1, dt * LERP_SPEED))
      lv.fogDensity = lerp(lv.fogDensity, tgtFogDensity, Math.min(1, dt * LERP_SPEED))
      lv.waterFault = lerp(lv.waterFault, tgtWaterFault, Math.min(1, dt * LERP_SPEED))
      lv.co2Tint = lerp(lv.co2Tint, tgtCo2Tint, Math.min(1, dt * LERP_SPEED))

      // ── apply environment to lighting ──
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

      // ── dust storm fog ──
      if (lv.fogDensity > 0.0001) {
        if (!scene.fog) scene.fog = new THREE.FogExp2('#CC6633', lv.fogDensity)
        else { scene.fog.color.set('#CC6633'); scene.fog.density = lv.fogDensity }
      } else if (scene.fog) {
        scene.fog = null
      }

      // ── update plants from backend crops ──
      if (ss?.crops) {
        const domeCrops = distributeCrops(ss.crops, DOME_DEFS)
        for (let di = 0; di < greenhouses.length; di++) {
          const gh = greenhouses[di]
          const plants = gh.userData.plantMeshes || []
          const crops = domeCrops[di] || []
          for (let pi = 0; pi < plants.length; pi++) {
            const mesh = plants[pi]
            const mat = mesh.material
            const base = mesh.userData.baseScale || 0.12
            if (pi < crops.length) {
              const crop = crops[pi]
              const progress = crop.maturity_days > 0
                ? Math.min(1, crop.age_days / crop.maturity_days) : 0
              const tgtScale = base * lerp(0.3, 1.0, progress)

              const isDead = crop.status === 'dead' || crop.status === 'wilted'
              const isHarvest = crop.status === 'ready_to_harvest'
              const colorHex = isDead ? CROP_DEAD_COLOR
                : (CROP_COLORS[crop.name] || '#33cc55')
              mat.color.set(colorHex)
              if (isHarvest) {
                mat.emissive.set(CROP_HARVEST_EMISSIVE)
                mat.emissiveIntensity = 0.6
              } else {
                mat.emissive.set(isDead ? '#000000' : colorHex)
                mat.emissiveIntensity = isDead ? 0 : 0.25
              }

              mesh.scale.set(
                lerp(mesh.scale.x, tgtScale, Math.min(1, dt * LERP_SPEED)),
                lerp(mesh.scale.y, tgtScale * 1.3, Math.min(1, dt * LERP_SPEED)),
                lerp(mesh.scale.z, tgtScale, Math.min(1, dt * LERP_SPEED)),
              )
            } else {
              mat.color.set(CROP_EMPTY_COLOR)
              mat.emissive.set('#000000')
              mat.emissiveIntensity = 0
              const emptyScale = base * 0.15
              mesh.scale.set(
                lerp(mesh.scale.x, emptyScale, Math.min(1, dt * LERP_SPEED)),
                lerp(mesh.scale.y, emptyScale, Math.min(1, dt * LERP_SPEED)),
                lerp(mesh.scale.z, emptyScale, Math.min(1, dt * LERP_SPEED)),
              )
            }
          }

          // ── water pool fault effect ──
          const wpMat = gh.userData.waterPoolMat
          if (wpMat) {
            if (lv.waterFault > 0.5) {
              const pulse = Math.sin(now * 0.006) * 0.5 + 0.5
              wpMat.color.lerpColors(new THREE.Color('#112244'), new THREE.Color('#cc2222'), lv.waterFault * pulse)
              wpMat.emissive.lerpColors(new THREE.Color('#0055aa'), new THREE.Color('#ff0000'), lv.waterFault * pulse)
            } else {
              wpMat.color.set('#112244')
              wpMat.emissive.set('#0055aa')
            }
          }

          // ── co2 spike shell tint ──
          const shellMat = gh.userData.shellMat
          if (shellMat) {
            if (lv.co2Tint > 0.05) {
              shellMat.color.lerpColors(new THREE.Color('#88ccbb'), new THREE.Color('#aacc44'), lv.co2Tint)
            } else {
              shellMat.color.set('#88ccbb')
            }
          }
        }
      }

      // ── fps / hud ──
      frameCount++; fpsAccum += dt
      const cropsArr = ss?.crops || []
      if (now - lastFpsUpdate > 500) {
        const fps = Math.round(frameCount / fpsAccum)
        setHud({
          angle: (sunPhase * 360).toFixed(1),
          dir: compassDir(sunPhase * 360),
          fps,
          dome: anim.dome ? anim.dome.userData.domeId : '—',
          zoom: camera.zoom.toFixed(2),
          missionDay: ss?.mission_day || 0,
          waterL: ss?.resources?.water_l ?? 0,
          nutrientsKg: ss?.resources?.nutrients_kg ?? 0,
          cropsGrowing: cropsArr.filter(c => c.status === 'growing').length,
          cropsReady: cropsArr.filter(c => c.status === 'ready_to_harvest').length,
          activeEvents: events,
        })
        frameCount = 0; fpsAccum = 0; lastFpsUpdate = now
      }

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
    const ribs = domeGroup.getObjectByName('ribs')
    if (ribs) ribs.visible = true

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
    const interior = anim.dome.getObjectByName('interior')
    if (interior) interior.visible = false
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

  /* ── main exit: leave selection first, then scene ── */
  const handleExit = useCallback(() => {
    if (insideDome) {
      handleExitDome()
      return
    }
    onExit()
  }, [insideDome, handleExitDome, onExit])

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

  /* ── keep ref in sync so animation loop can read it ── */
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  /* ── timeline: advance day when day-night cycle completes ── */
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
        }
        lastFrac = curFrac
      }, 100)
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    }
    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current) }
  }, [isPlaying, totalDays])

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

      {/* ── resource HUD ── */}
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
          </span>
        </div>
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
            onChange={e => { setSimDay(Number(e.target.value)); simDayFracRef.current = 0 }}
          />
          <span className="gh-timeline-label">Sol {totalDays}</span>
        </div>
      </div>
    </div>
  )
}
