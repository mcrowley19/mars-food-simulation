import * as THREE from 'three'
import {
  CROP_COLORS, CROP_DEAD_COLOR, CROP_HARVEST_EMISSIVE,
  INITIAL_WATER, lerp,
} from './constants'

const STEM_COLOR = '#4b7d3a'
const LEAF_FALLBACK_COLOR = '#4fa04b'
const MODEL_VISUAL_SCALE = 2.8
const MIN_GROWTH_FACTOR = 0.6
const MAX_GROWTH_FACTOR = 1.25
const FRUIT_COLOR_BY_CROP = {
  tomato: '#d63a2f',
  radish: '#cc3a54',
  carrot: '#e27f1a',
  potato: '#8B7355',
  pea: '#79bf59',
  soybean: '#9ACD32',
  wheat: '#d2a450',
}

function _addPart(group, geom, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(geom, mat)
  mesh.position.set(x, y, z)
  mesh.rotation.set(rx, ry, rz)
  mesh.scale.set(sx, sy, sz)
  group.add(mesh)
  return mesh
}

function _makeMat(color, roughness = 0.62) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: '#000000',
    emissiveIntensity: 0,
    roughness,
    metalness: 0.04,
    fog: false,
  })
}

function _buildLeafyRosette(group, leafColor, density = 7) {
  const stemMat = _makeMat(STEM_COLOR, 0.7)
  const leafMat = _makeMat(leafColor, 0.68)
  _addPart(group, new THREE.CylinderGeometry(0.12, 0.16, 0.45, 8), stemMat, 0, 0.22, 0)
  for (let i = 0; i < density; i++) {
    const a = (i / density) * Math.PI * 2
    const tilt = 0.45 + (i % 2) * 0.12
    _addPart(
      group,
      new THREE.SphereGeometry(0.22, 10, 8),
      leafMat,
      Math.cos(a) * 0.36,
      0.22 + (i % 3) * 0.03,
      Math.sin(a) * 0.36,
      tilt,
      a,
      0,
      1.35,
      0.42,
      0.7,
    )
  }
  return [stemMat, leafMat]
}

function _buildWheat(group) {
  const stemMat = _makeMat('#7aa457', 0.68)
  const grainMat = _makeMat('#d6b05f', 0.6)
  const stalkCount = 5
  for (let i = 0; i < stalkCount; i++) {
    const off = (i - (stalkCount - 1) / 2) * 0.12
    _addPart(group, new THREE.CylinderGeometry(0.03, 0.04, 1.2, 6), stemMat, off, 0.64, (i % 2) * 0.08 - 0.04)
    _addPart(group, new THREE.CylinderGeometry(0.04, 0.06, 0.28, 6), grainMat, off, 1.25, (i % 2) * 0.08 - 0.04, 0.1, 0, 0.25)
  }
  return [stemMat, grainMat]
}

function _buildTomato(group) {
  const stemMat = _makeMat('#4f8f48', 0.66)
  const leafMat = _makeMat('#3f913f', 0.68)
  const fruitMat = _makeMat(FRUIT_COLOR_BY_CROP.tomato, 0.52)
  _addPart(group, new THREE.CylinderGeometry(0.08, 0.1, 0.9, 8), stemMat, 0, 0.46, 0)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    _addPart(
      group,
      new THREE.SphereGeometry(0.18, 10, 8),
      leafMat,
      Math.cos(a) * 0.28,
      0.62 + (i % 2) * 0.06,
      Math.sin(a) * 0.28,
      0.2,
      a,
      0,
      1.3,
      0.45,
      0.8,
    )
  }
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1
    _addPart(group, new THREE.SphereGeometry(0.12, 10, 8), fruitMat, Math.cos(a) * 0.24, 0.36, Math.sin(a) * 0.24)
  }
  return [stemMat, leafMat, fruitMat]
}

function _buildPotato(group) {
  const mats = _buildLeafyRosette(group, '#5b9d4f', 6)
  const tuberMat = _makeMat(FRUIT_COLOR_BY_CROP.potato, 0.86)
  _addPart(group, new THREE.SphereGeometry(0.18, 10, 8), tuberMat, -0.18, -0.04, 0.12, 0, 0, 0, 1.1, 0.75, 0.9)
  _addPart(group, new THREE.SphereGeometry(0.16, 10, 8), tuberMat, 0.16, -0.05, -0.08, 0, 0, 0, 1.15, 0.72, 0.9)
  return [...mats, tuberMat]
}

function _buildCarrot(group) {
  const stemMat = _makeMat('#4f8d45', 0.68)
  const leafMat = _makeMat('#5ea852', 0.68)
  const rootMat = _makeMat(FRUIT_COLOR_BY_CROP.carrot, 0.74)

  // Carrot root should mostly be below soil; only a tiny crown peeks out.
  _addPart(group, new THREE.ConeGeometry(0.13, 0.95, 10), rootMat, 0, -0.62, 0, Math.PI, 0, 0)
  _addPart(group, new THREE.SphereGeometry(0.07, 10, 8), rootMat, 0, 0.02, 0, 0, 0, 0, 1, 0.45, 1)
  _addPart(group, new THREE.CylinderGeometry(0.04, 0.05, 0.22, 8), stemMat, 0, 0.14, 0)

  // Upright fern-like foliage above the bed surface.
  const fronds = 8
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2
    const h = 0.58 + (i % 3) * 0.08
    _addPart(
      group,
      new THREE.CapsuleGeometry(0.028, h, 4, 8),
      leafMat,
      Math.cos(a) * 0.08,
      0.36 + h * 0.18,
      Math.sin(a) * 0.08,
      0.28,
      a,
      0,
      1,
      1,
      1,
    )
  }
  return [stemMat, leafMat, rootMat]
}

function _buildRadish(group) {
  const leafMat = _makeMat('#5ca85b', 0.68)
  const bulbMat = _makeMat(FRUIT_COLOR_BY_CROP.radish, 0.66)
  _addPart(group, new THREE.SphereGeometry(0.2, 10, 8), bulbMat, 0, 0.03, 0, 0, 0, 0, 1, 0.85, 1)
  _addPart(group, new THREE.ConeGeometry(0.04, 0.2, 8), bulbMat, 0, -0.11, 0, Math.PI, 0, 0)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    _addPart(
      group,
      new THREE.SphereGeometry(0.16, 10, 8),
      leafMat,
      Math.cos(a) * 0.18,
      0.32 + (i % 2) * 0.04,
      Math.sin(a) * 0.18,
      0.35,
      a,
      0,
      1.45,
      0.35,
      0.68,
    )
  }
  return [leafMat, bulbMat]
}

function _buildLegume(group, cropName) {
  const stemMat = _makeMat('#5f9f4f', 0.68)
  const leafMat = _makeMat('#62aa52', 0.68)
  const podMat = _makeMat(FRUIT_COLOR_BY_CROP[cropName] || '#7cbc58', 0.6)
  _addPart(group, new THREE.CylinderGeometry(0.06, 0.08, 0.9, 8), stemMat, 0, 0.45, 0)
  for (let i = 0; i < 4; i++) {
    const a = i * (Math.PI / 2)
    _addPart(
      group,
      new THREE.SphereGeometry(0.16, 10, 8),
      leafMat,
      Math.cos(a) * 0.24,
      0.52 + (i % 2) * 0.08,
      Math.sin(a) * 0.24,
      0.25,
      a,
      0,
      1.35,
      0.4,
      0.7,
    )
  }
  for (let i = 0; i < 2; i++) {
    const z = i === 0 ? -0.14 : 0.14
    _addPart(group, new THREE.CapsuleGeometry(0.055, 0.2, 4, 8), podMat, 0.2, 0.4 + i * 0.08, z, 0.2, 0.2, 1.2)
  }
  return [stemMat, leafMat, podMat]
}

function _buildCropVisual(cropName) {
  const kind = String(cropName || '').toLowerCase()
  const g = new THREE.Group()
  const mats = []
  if (kind === 'wheat') mats.push(..._buildWheat(g))
  else if (kind === 'tomato') mats.push(..._buildTomato(g))
  else if (kind === 'potato') mats.push(..._buildPotato(g))
  else if (kind === 'carrot') mats.push(..._buildCarrot(g))
  else if (kind === 'radish') mats.push(..._buildRadish(g))
  else if (kind === 'pea' || kind === 'soybean') mats.push(..._buildLegume(g, kind))
  else mats.push(..._buildLeafyRosette(g, CROP_COLORS[kind] || LEAF_FALLBACK_COLOR, kind === 'kale' ? 9 : 7))
  g.userData.materials = mats
  return g
}

function _ensureCropVisual(plantGroup, cropName) {
  const kind = String(cropName || '').toLowerCase()
  if (plantGroup.userData.visualType === kind && plantGroup.children.length > 0) return
  while (plantGroup.children.length > 0) {
    const c = plantGroup.children[0]
    plantGroup.remove(c)
    c.traverse?.((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) o.material.dispose()
    })
  }
  const visual = _buildCropVisual(kind)
  plantGroup.add(visual)
  plantGroup.userData.visualType = kind
  plantGroup.userData.visualMats = visual.userData.materials || []
}

function _setPlantVisualState(plantGroup, crop, isDead, isHarvest) {
  const mats = Array.isArray(plantGroup.userData.visualMats) ? plantGroup.userData.visualMats : []
  const kind = String(crop?.name || '').toLowerCase()
  const liveColor = CROP_COLORS[kind] || LEAF_FALLBACK_COLOR
  const accent = FRUIT_COLOR_BY_CROP[kind] || liveColor
  for (const mat of mats) {
    if (!mat?.color) continue
    if (isDead) {
      mat.color.set(CROP_DEAD_COLOR)
      mat.emissive.set('#000000')
      mat.emissiveIntensity = 0
      continue
    }
    const currentHex = `#${mat.color.getHexString()}`
    const isFruitLike = currentHex === accent || currentHex === FRUIT_COLOR_BY_CROP.tomato
    mat.color.set(isFruitLike ? accent : liveColor)
    if (isHarvest) {
      mat.emissive.set(CROP_HARVEST_EMISSIVE)
      mat.emissiveIntensity = 0.4
    } else {
      mat.emissive.set('#000000')
      mat.emissiveIntensity = 0
    }
  }
}

export function distributeCrops(crops, domeDefsArr) {
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

export function updateCropsAndBeds(greenhouses, domeDefs, ss, lv, dt) {
  const LERP_SPEED = 4
  if (!ss?.crops) return

  const domeCrops = distributeCrops(ss.crops, domeDefs)
  for (let di = 0; di < greenhouses.length; di++) {
    const gh = greenhouses[di]
    const plants = gh.userData.plantMeshes || []
    const planters = gh.userData.planterMeshes || []
    const soilMeshes = gh.userData.soilMeshes || []
    const crops = domeCrops[di] || []
    for (let pi = 0; pi < plants.length; pi++) {
      const hasCrop = pi < crops.length
      if (planters[pi]) planters[pi].visible = true
      if (soilMeshes[pi]) soilMeshes[pi].visible = true
      const mesh = plants[pi]
      mesh.visible = hasCrop
      if (!hasCrop) continue
      const mat = mesh.material
      const base = mesh.userData.baseScale || 0.12
      const crop = crops[pi]
      const progress = crop.maturity_days > 0
        ? Math.min(1, crop.age_days / crop.maturity_days) : 0
      const tgtScale = base * MODEL_VISUAL_SCALE * lerp(MIN_GROWTH_FACTOR, MAX_GROWTH_FACTOR, progress)

      const isDead = crop.status === 'dead' || crop.status === 'wilted'
      const isHarvest = crop.status === 'ready_to_harvest'

      _ensureCropVisual(mesh, crop.name)
      _setPlantVisualState(mesh, crop, isDead, isHarvest)

      mesh.scale.set(
        lerp(mesh.scale.x, tgtScale, Math.min(1, dt * LERP_SPEED)),
        lerp(mesh.scale.y, tgtScale * 1.45, Math.min(1, dt * LERP_SPEED)),
        lerp(mesh.scale.z, tgtScale, Math.min(1, dt * LERP_SPEED)),
      )
    }

    const soils = gh.userData.soilMats || []
    const wPct = ss?.resources?.water_l != null && INITIAL_WATER > 0
      ? ss.resources.water_l / INITIAL_WATER : 1
    const nPct = ss?.resources?.nutrients_kg != null
      ? ss.resources.nutrients_kg / 200 : 1
    for (let si = 0; si < soils.length; si++) {
      const sm = soils[si]
      const bedCrops = si < crops.length ? [crops[si]] : []
      if (bedCrops.length === 0) {
        sm.color.set('#1a1a10')
        sm.emissive.set('#000000')
        sm.emissiveIntensity = 0
      } else {
        const hasHarvest = bedCrops.some(c => c.status === 'ready_to_harvest')
        const hasDead = bedCrops.some(c => c.status === 'dead' || c.status === 'wilted')
        if (hasDead) {
          sm.color.set('#3a2a18')
        } else if (hasHarvest) {
          sm.color.set('#2a2a12')
          sm.color.lerp(new THREE.Color('#4a4020'), 0.3)
        } else {
          sm.color.set('#1a2010')
        }
        const moistureGlow = Math.max(0, Math.min(1, wPct * 2 - 0.4))
        sm.emissive.set('#1a3a5a')
        sm.emissiveIntensity = moistureGlow * 0.15
        if (nPct < 0.15) {
          sm.color.lerp(new THREE.Color('#4a1a1a'), 0.25)
        }
      }
    }

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
