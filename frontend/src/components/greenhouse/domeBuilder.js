import * as THREE from 'three'
import { DOME_OPACITY, CROP_EMPTY_COLOR } from './constants'

function buildDomeInterior(radius) {
  const g = new THREE.Group()
  const FLOOR_Y = 0.1
  const floorMat = new THREE.MeshStandardMaterial({ color: '#f1f1f1', roughness: 0.82, metalness: 0.04 })
  const planterMat = new THREE.MeshStandardMaterial({ color: '#6a4429', roughness: 0.8, metalness: 0.08 })
  const plantGeom = new THREE.SphereGeometry(1, 10, 8)
  const plantMeshes = []
  const soilMats = []
  const soilMeshes = []
  const planterMeshes = []

  const floor = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = FLOOR_Y
  floor.receiveShadow = true
  g.add(floor)

  const colSpacing = Math.max(1.7, radius * 0.15)
  const colWidth = colSpacing * 0.7
  const boxH = colSpacing * 0.22
  const soilH = 0.03
  const usableRadius = radius * 0.78
  const MAX_PLANTERS = 240
  const plantsPerCol = Math.max(2, Math.floor(radius * 1.2))

  for (let x = -usableRadius; x <= usableRadius; x += colSpacing) {
    if (plantMeshes.length >= MAX_PLANTERS) break

    // Calculate the length of this column based on the circular dome footprint
    const halfLen = Math.sqrt(Math.max(0, (usableRadius * usableRadius) - (x * x)))
    if (halfLen < colWidth) continue
    const colLen = halfLen * 2

    // Wooden border/rim around the planter
    const rimThickness = 0.08
    const rimHeight = boxH + soilH
    const rimMat = new THREE.MeshStandardMaterial({ color: '#6a4429', roughness: 0.7, metalness: 0.12 })
    const rimY = FLOOR_Y + rimHeight / 2 + 0.02
    // Long sides (along Z)
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(rimThickness, rimHeight, colLen), rimMat)
    sideL.position.set(x - colWidth / 2, rimY, 0)
    g.add(sideL)
    const sideR = new THREE.Mesh(new THREE.BoxGeometry(rimThickness, rimHeight, colLen), rimMat)
    sideR.position.set(x + colWidth / 2, rimY, 0)
    g.add(sideR)
    // Short ends (along X)
    const endF = new THREE.Mesh(new THREE.BoxGeometry(colWidth + rimThickness, rimHeight, rimThickness), rimMat)
    endF.position.set(x, rimY, -halfLen)
    g.add(endF)
    const endB = new THREE.Mesh(new THREE.BoxGeometry(colWidth + rimThickness, rimHeight, rimThickness), rimMat)
    endB.position.set(x, rimY, halfLen)
    g.add(endB)

    // Single continuous soil bed filling the planter
    const soilInnerW = colWidth - rimThickness
    const soilMat = new THREE.MeshStandardMaterial({
      color: '#3f2a1d', emissive: '#000000', emissiveIntensity: 0, roughness: 0.9,
    })
    const soil = new THREE.Mesh(new THREE.BoxGeometry(soilInnerW, boxH + soilH, colLen - rimThickness), soilMat)
    soil.position.set(x, FLOOR_Y + (boxH + soilH) / 2 + 0.02, 0)
    g.add(soil)

    // Distribute individual plant slots along this column
    const slotsInCol = Math.min(plantsPerCol, MAX_PLANTERS - plantMeshes.length)
    const slotSpacing = colLen / (slotsInCol + 1)

    for (let si = 0; si < slotsInCol; si++) {
      const z = -halfLen + slotSpacing * (si + 1)
      planterMeshes.push(soil)
      soilMats.push(soilMat)
      soilMeshes.push(soil)

      const pBase = Math.max(0.08, colWidth * 0.16)
      const plantMat = new THREE.MeshStandardMaterial({
        color: CROP_EMPTY_COLOR, emissive: '#000000', emissiveIntensity: 0, roughness: 0.55,
      })
      const plant = new THREE.Mesh(plantGeom, plantMat)
      plant.position.set(x, FLOOR_Y + boxH + soilH + pBase + 0.02, z)
      plant.scale.set(pBase, pBase * 1.25, pBase)
      plant.userData.isPlant = true
      plant.userData.baseScale = pBase
      g.add(plant)
      plantMeshes.push(plant)
    }
  }

  return { group: g, plantMeshes, soilMats, soilMeshes, planterMeshes }
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

  const { group: interiorGroup, plantMeshes, soilMats, soilMeshes, planterMeshes } = buildDomeInterior(r)
  interiorGroup.visible = true
  interiorGroup.name = 'interior'
  group.add(interiorGroup)

  group.userData.plantMeshes = plantMeshes
  group.userData.soilMats = soilMats
  group.userData.soilMeshes = soilMeshes
  group.userData.planterMeshes = planterMeshes
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
