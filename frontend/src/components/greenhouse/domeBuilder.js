import * as THREE from 'three'
import { DOME_OPACITY, CROP_EMPTY_COLOR } from './constants'

function buildDomeInterior(radius) {
  const g = new THREE.Group()

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

  const floor = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.95, 64), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.01
  floor.receiveShadow = true
  g.add(floor)

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

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const line = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.8, 0.02, 0.04), ringLineMat)
    line.position.y = 0.02
    line.rotation.y = a
    g.add(line)
  }

  const bayCount = 8
  const plantMeshes = []
  const soilMats = []
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

      const smat = new THREE.MeshStandardMaterial({
        color: '#1a1a10', emissive: '#000000', emissiveIntensity: 0, roughness: 0.8,
      })
      const soil = new THREE.Mesh(new THREE.BoxGeometry(bedW * 0.88, 0.04, bedD * 0.88), smat)
      soil.position.set(bx, bedH + 0.04, bz)
      soil.rotation.y = angle
      soil.userData.isSoilBed = true
      g.add(soil)
      soilMats.push(smat)

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

  const hubR = radius * 0.15
  const hubBase = new THREE.Mesh(
    new THREE.CylinderGeometry(hubR, hubR * 1.1, 0.15, 8), panelMat
  )
  hubBase.position.y = 0.08
  hubBase.castShadow = true
  g.add(hubBase)

  const tableMat = new THREE.MeshStandardMaterial({
    color: '#222228', metalness: 0.6, roughness: 0.2,
  })
  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(hubR * 0.7, hubR * 0.7, 0.08, 16), tableMat
  )
  table.position.y = 0.5
  table.castShadow = true
  g.add(table)
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(hubR * 0.15, hubR * 0.2, 0.4, 8), metalMat
  )
  pedestal.position.y = 0.35
  g.add(pedestal)

  const holoMat = new THREE.MeshStandardMaterial({
    color: '#00ffcc', emissive: '#00ddaa', emissiveIntensity: 0.9,
    transparent: true, opacity: 0.3,
  })
  const holo = new THREE.Mesh(
    new THREE.CylinderGeometry(hubR * 0.5, hubR * 0.5, 0.02, 32), holoMat
  )
  holo.position.y = 0.56
  g.add(holo)

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

  const walkR = radius * 0.82
  const walkway = new THREE.Mesh(
    new THREE.TorusGeometry(walkR, 0.2, 6, 96), panelMat
  )
  walkway.rotation.x = Math.PI / 2
  walkway.position.y = 0.03
  g.add(walkway)

  const innerWalk = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.48, 0.15, 6, 64), panelMat
  )
  innerWalk.rotation.x = Math.PI / 2
  innerWalk.position.y = 0.03
  g.add(innerWalk)

  const pathMat = new THREE.MeshStandardMaterial({ color: '#333338', roughness: 0.35, metalness: 0.3 })
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const path = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.6, 0.05, 0.5), pathMat)
    path.position.y = 0.025
    path.rotation.y = a
    path.receiveShadow = true
    g.add(path)
  }

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    for (const offset of [-0.28, 0.28]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 1.5, 0.02, 0.05), accentMat
      )
      strip.position.y = 0.035
      strip.rotation.y = a
      strip.position.x = Math.sin(a) * offset
      strip.position.z = -Math.cos(a) * offset
      g.add(strip)
    }
  }

  const stationCount = 6
  for (let i = 0; i < stationCount; i++) {
    const a = (i / stationCount) * Math.PI * 2
    if (Math.abs(a - Math.PI / 2) < 0.4) continue
    const sx = Math.cos(a) * (radius * 0.75)
    const sz = Math.sin(a) * (radius * 0.75)

    const console = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.5), darkMat)
    console.position.set(sx, 0.35, sz)
    console.rotation.y = a + Math.PI
    console.castShadow = true
    g.add(console)
    const scr = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.03), screenMat)
    scr.position.set(sx, 0.65, sz)
    scr.rotation.y = a + Math.PI
    g.add(scr)
    const indicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 4),
      i % 2 === 0 ? accentMat : warmAccent
    )
    indicator.position.set(sx + Math.cos(a + Math.PI) * 0.4, 0.75, sz + Math.sin(a + Math.PI) * 0.4)
    g.add(indicator)
  }

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 8
    const px = Math.cos(a) * radius * 0.6
    const pz = Math.sin(a) * radius * 0.6

    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.25, radius * 0.4, 8), metalMat
    )
    col.position.set(px, radius * 0.2, pz)
    col.castShadow = true
    g.add(col)

    const colRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.04, 6, 16), accentMat
    )
    colRing.rotation.x = Math.PI / 2
    colRing.position.set(px, radius * 0.4, pz)
    g.add(colRing)

    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.04, 6, 16), accentMat
    )
    baseRing.rotation.x = Math.PI / 2
    baseRing.position.set(px, 0.05, pz)
    g.add(baseRing)
  }

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
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.03, 4, 12), warmAccent
    )
    band.rotation.x = Math.PI / 2
    band.position.set(tx, 0.7, tz)
    g.add(band)
  }

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

  return { group: g, plantMeshes, soilMats, waterPoolMat: waterMat }
}

export function buildSingleDome(def) {
  const { id, r } = def
  const group = new THREE.Group()
  group.userData.domeId = id
  group.userData.radius = r

  const ribMat = new THREE.MeshStandardMaterial({ color: '#aaaaaa', roughness: 0.4, metalness: 0.6 })

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

  const ribs = new THREE.Group()
  ribs.name = 'ribs'

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

  for (let i = 0; i < 12; i++) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.06, 8, 64, Math.PI / 2),
      ribMat
    )
    rib.rotation.set(0, (i / 12) * Math.PI * 2, 0)
    rib.castShadow = true
    ribs.add(rib)
  }

  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(r, 0.14, 12, 64), ribMat
  )
  baseRing.rotation.x = Math.PI / 2
  baseRing.position.y = 0.01
  baseRing.castShadow = true
  ribs.add(baseRing)

  group.add(ribs)

  const foundMat = new THREE.MeshStandardMaterial({ color: '#666666', roughness: 0.5, metalness: 0.4 })
  const foundation = new THREE.Mesh(
    new THREE.TorusGeometry(r + 0.3, 0.3, 8, 64), foundMat
  )
  foundation.rotation.x = Math.PI / 2
  foundation.position.y = -0.05
  foundation.receiveShadow = true
  group.add(foundation)

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

  const { group: interiorGroup, plantMeshes, soilMats, waterPoolMat } = buildDomeInterior(r)
  interiorGroup.visible = true
  interiorGroup.name = 'interior'
  group.add(interiorGroup)

  group.userData.plantMeshes = plantMeshes
  group.userData.soilMats = soilMats
  group.userData.waterPoolMat = waterPoolMat
  group.userData.shellMat = domeMat

  return group
}

export function buildColony(scene, domeDefs) {
  const greenhouses = []

  for (const def of domeDefs) {
    const dome = buildSingleDome(def)
    dome.position.set(def.x, 0, def.z)
    scene.add(dome)
    greenhouses.push(dome)
  }

  return greenhouses
}
