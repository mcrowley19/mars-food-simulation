import { useRef, useEffect, useState, useCallback } from 'react'
import * as THREE from 'three'
import './GreenhouseScene.css'

/* ───────────────────────── helpers ───────────────────────── */

function radToDeg(r) {
  return ((r * 180) / Math.PI) % 360
}

function compassDir(angleDeg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const i = Math.round(((angleDeg % 360) + 360) % 360 / 45) % 8
  return dirs[i]
}

/* ─────────────────── scene construction ─────────────────── */

function initScene(canvas, width, height) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#1a0a04')

  // orthographic camera — bird's-eye
  const aspect = width / height
  const frustum = 18
  const camera = new THREE.OrthographicCamera(
    -frustum * aspect, frustum * aspect,
    frustum, -frustum,
    0.1, 200
  )
  camera.position.set(0, 40, 0)
  camera.lookAt(0, 0, 0)

  return { renderer, scene, camera }
}

function buildTerrain(scene) {
  const geo = new THREE.PlaneGeometry(80, 80)
  const mat = new THREE.MeshStandardMaterial({
    color: '#c1440e',
    roughness: 0.95,
    metalness: 0.0,
  })
  const ground = new THREE.Mesh(geo, mat)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // scatter a few small rocks for visual interest
  const rockGeo = new THREE.DodecahedronGeometry(0.3, 0)
  const rockMat = new THREE.MeshStandardMaterial({
    color: '#8b3a0f',
    roughness: 1,
  })
  const rockPositions = [
    [-8, 0.15, -6], [10, 0.12, 4], [-5, 0.1, 9],
    [7, 0.14, -9], [-12, 0.1, 2], [3, 0.13, -11],
  ]
  for (const [x, y, z] of rockPositions) {
    const rock = new THREE.Mesh(rockGeo, rockMat)
    rock.position.set(x, y, z)
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0)
    rock.scale.setScalar(0.5 + Math.random() * 1.5)
    rock.castShadow = true
    scene.add(rock)
  }
}

function buildGreenhouse(scene) {
  const group = new THREE.Group()

  // ── dome ──
  const domeGeo = new THREE.SphereGeometry(5, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2)
  const domeMat = new THREE.MeshPhysicalMaterial({
    color: '#88ccbb',
    transparent: true,
    opacity: 0.4,
    roughness: 0.1,
    metalness: 0.0,
    transmission: 0.5,
    thickness: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const dome = new THREE.Mesh(domeGeo, domeMat)
  dome.castShadow = true
  dome.receiveShadow = true
  group.add(dome)

  // ── structural ribs (torus rings) ──
  const ribMat = new THREE.MeshStandardMaterial({
    color: '#aaaaaa',
    roughness: 0.4,
    metalness: 0.6,
  })
  // horizontal ribs at different latitudes
  const ribAngles = [15, 35, 55, 75]
  for (const angleDeg of ribAngles) {
    const angle = (angleDeg * Math.PI) / 180
    const r = 5 * Math.sin(angle)
    const y = 5 * Math.cos(angle)
    const ribGeo = new THREE.TorusGeometry(r, 0.06, 8, 64)
    const rib = new THREE.Mesh(ribGeo, ribMat)
    rib.position.y = y
    rib.rotation.x = Math.PI / 2
    rib.castShadow = true
    group.add(rib)
  }

  // vertical meridian ribs
  for (let i = 0; i < 8; i++) {
    const theta = (i / 8) * Math.PI * 2
    const ribGeo = new THREE.TorusGeometry(5, 0.06, 8, 64, Math.PI / 2)
    const rib = new THREE.Mesh(ribGeo, ribMat)
    rib.rotation.set(0, theta, 0)
    rib.castShadow = true
    group.add(rib)
  }

  // ── dome base ring ──
  const baseRingGeo = new THREE.TorusGeometry(5, 0.12, 12, 64)
  const baseRing = new THREE.Mesh(baseRingGeo, ribMat)
  baseRing.rotation.x = Math.PI / 2
  baseRing.position.y = 0.01
  baseRing.castShadow = true
  group.add(baseRing)

  // ── airlock vestibule ──
  const airlockGeo = new THREE.CylinderGeometry(1.0, 1.0, 2.2, 16, 1, false, 0, Math.PI)
  const airlockMat = new THREE.MeshPhysicalMaterial({
    color: '#88ccbb',
    transparent: true,
    opacity: 0.35,
    roughness: 0.15,
    metalness: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const airlock = new THREE.Mesh(airlockGeo, airlockMat)
  airlock.position.set(0, 1.1, 5.6)
  airlock.rotation.y = Math.PI / 2
  airlock.castShadow = true
  group.add(airlock)

  // airlock frame
  const frameMat = new THREE.MeshStandardMaterial({
    color: '#999999',
    roughness: 0.3,
    metalness: 0.7,
  })
  const frameGeo = new THREE.TorusGeometry(1.0, 0.08, 8, 32, Math.PI)
  const frame = new THREE.Mesh(frameGeo, frameMat)
  frame.position.set(0, 1.1, 5.6)
  frame.rotation.set(Math.PI / 2, 0, Math.PI / 2)
  frame.castShadow = true
  group.add(frame)

  // connecting tunnel floor
  const tunnelGeo = new THREE.BoxGeometry(1.8, 0.08, 1.4)
  const tunnelFloor = new THREE.Mesh(tunnelGeo, frameMat)
  tunnelFloor.position.set(0, 0.04, 5.6)
  tunnelFloor.receiveShadow = true
  group.add(tunnelFloor)

  scene.add(group)
}

function setupLighting(scene) {
  // ambient — dim Martian atmosphere
  const ambient = new THREE.AmbientLight('#441a00', 0.3)
  scene.add(ambient)

  // sun (directional) — will be animated
  const sun = new THREE.DirectionalLight('#ffe8cc', 2.0)
  sun.castShadow = true
  sun.shadow.mapSize.width = 2048
  sun.shadow.mapSize.height = 2048
  sun.shadow.camera.left = -20
  sun.shadow.camera.right = 20
  sun.shadow.camera.top = 20
  sun.shadow.camera.bottom = -20
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 80
  sun.shadow.bias = -0.001
  scene.add(sun)

  return sun
}

/* ──────────────────── React component ───────────────────── */

export default function GreenhouseScene({ onExit }) {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)    // holds renderer/scene/camera/sun
  const rafRef = useRef(null)
  const [hud, setHud] = useState({ angle: 0, dir: 'N', fps: 0 })

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (stateRef.current) {
      const { renderer, scene } = stateRef.current
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
          else obj.material.dispose()
        }
      })
      renderer.dispose()
    }
    stateRef.current = null
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const w = window.innerWidth
    const h = window.innerHeight

    // ── init ──
    const { renderer, scene, camera } = initScene(canvas, w, h)
    buildTerrain(scene)
    buildGreenhouse(scene)
    const sun = setupLighting(scene)
    stateRef.current = { renderer, scene, camera, sun }

    // ── resize handler ──
    const onResize = () => {
      const nw = window.innerWidth
      const nh = window.innerHeight
      renderer.setSize(nw, nh)
      const aspect = nw / nh
      const frustum = 18
      camera.left = -frustum * aspect
      camera.right = frustum * aspect
      camera.top = frustum
      camera.bottom = -frustum
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    // ── animate ──
    const SUN_RADIUS = 30
    const SUN_HEIGHT = 18
    const SUN_SPEED = 0.15  // radians per second
    let sunAngle = 0
    let lastTime = performance.now()
    let frameCount = 0
    let fpsAccum = 0
    let lastFpsUpdate = performance.now()

    const animate = (now) => {
      rafRef.current = requestAnimationFrame(animate)

      const dt = (now - lastTime) / 1000
      lastTime = now

      // fps
      frameCount++
      fpsAccum += dt
      if (now - lastFpsUpdate > 500) {
        const fps = Math.round(frameCount / fpsAccum)
        const angleDeg = radToDeg(sunAngle)
        setHud({ angle: angleDeg.toFixed(1), dir: compassDir(angleDeg), fps })
        frameCount = 0
        fpsAccum = 0
        lastFpsUpdate = now
      }

      // animate sun
      sunAngle += SUN_SPEED * dt
      sun.position.set(
        Math.cos(sunAngle) * SUN_RADIUS,
        SUN_HEIGHT,
        Math.sin(sunAngle) * SUN_RADIUS
      )
      sun.target.position.set(0, 0, 0)
      sun.target.updateMatrixWorld()

      renderer.render(scene, camera)
    }
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', onResize)
      cleanup()
    }
  }, [cleanup])

  return (
    <div className="gh-overlay">
      <canvas ref={canvasRef} className="gh-canvas" />

      {/* HUD */}
      <div className="gh-hud">
        <span className="gh-hud-label">SUN</span>
        <span className="gh-hud-value">{hud.angle}°</span>
        <span className="gh-hud-label">DIR</span>
        <span className="gh-hud-value">{hud.dir}</span>
        <span className="gh-hud-label">FPS</span>
        <span className="gh-hud-value">{hud.fps}</span>
      </div>

      <button className="gh-exit" onClick={onExit}>
        ← Exit
      </button>
    </div>
  )
}
