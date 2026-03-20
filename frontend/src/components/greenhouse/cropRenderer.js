import * as THREE from 'three'
import {
  CROP_COLORS, CROP_DEAD_COLOR, CROP_HARVEST_EMISSIVE,
  INITIAL_WATER, lerp,
} from './constants'

const LEAF_FALLBACK_COLOR = '#4fa04b'
const MODEL_VISUAL_SCALE  = 2.8
const MIN_GROWTH_FACTOR   = 0.6
const MAX_GROWTH_FACTOR   = 1.25

const SPHERE_GEOM = new THREE.SphereGeometry(0.5, 12, 8)

/* ── sphere visual ────────────────────────────────────────────────────────── */

function _buildCropVisual(cropName) {
  const kind  = String(cropName || '').toLowerCase()
  const color = CROP_COLORS[kind] || LEAF_FALLBACK_COLOR
  const mat   = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.65,
    metalness: 0.03,
    emissive: '#000000',
    emissiveIntensity: 0,
    fog: false,
  })
  const g = new THREE.Group()
  g.add(new THREE.Mesh(SPHERE_GEOM, mat))
  g.userData.materials = [mat]
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
  for (const mat of mats) {
    if (!mat?.color) continue
    if (isDead) {
      mat.color.set(CROP_DEAD_COLOR)
      mat.emissive?.set('#000000')
      mat.emissiveIntensity = 0
      continue
    }
    mat.color.set(liveColor)
    if (isHarvest) {
      mat.emissive?.set(CROP_HARVEST_EMISSIVE)
      mat.emissiveIntensity = 0.4
    } else {
      mat.emissive?.set('#000000')
      mat.emissiveIntensity = 0
    }
  }
}

/* ── public API ───────────────────────────────────────────────────────────── */

export function distributeCrops(crops, domeDefsArr) {
  if (!crops || !crops.length || !domeDefsArr) return domeDefsArr.map(() => [])
  const areas     = domeDefsArr.map(d => Math.PI * d.r * d.r)
  const totalArea = areas.reduce((a, b) => a + b, 0)
  const result    = domeDefsArr.map(() => [])
  let   assigned  = 0
  const counts    = domeDefsArr.map((_, i) => {
    const c = Math.floor(crops.length * (areas[i] / totalArea))
    assigned += c
    return c
  })
  let remainder = crops.length - assigned
  for (let i = 0; i < domeDefsArr.length && remainder > 0; i++) { counts[i]++; remainder-- }
  let idx = 0
  for (let i = 0; i < domeDefsArr.length; i++) {
    result[i] = crops.slice(idx, idx + counts[i])
    idx += counts[i]
  }
  return result
}

export function updateCropsAndBeds(greenhouses, domeDefs, ss, lv, dt) {
  const LERP_SPEED = 4

  const domeCrops = distributeCrops(ss?.crops || [], domeDefs)
  for (let di = 0; di < greenhouses.length; di++) {
    const gh       = greenhouses[di]
    const plants   = gh.userData.plantMeshes  || []
    const planters = gh.userData.planterMeshes || []
    const soilMeshes = gh.userData.soilMeshes  || []
    const crops    = domeCrops[di] || []

    for (let pi = 0; pi < plants.length; pi++) {
      const hasCrop = pi < crops.length
      if (planters[pi])   planters[pi].visible   = true
      if (soilMeshes[pi]) soilMeshes[pi].visible = true
      const mesh = plants[pi]
      mesh.visible = hasCrop
      if (!hasCrop) continue

      const crop     = crops[pi]
      const progress = crop.maturity_days > 0 ? Math.min(1, crop.age_days / crop.maturity_days) : 0
      const base     = mesh.userData.baseScale || 0.12
      const tgtScale = base * MODEL_VISUAL_SCALE * lerp(MIN_GROWTH_FACTOR, MAX_GROWTH_FACTOR, progress)
      const isDead   = crop.status === 'dead' || crop.status === 'wilted'
      const isHarv   = crop.status === 'ready_to_harvest'

      _ensureCropVisual(mesh, crop.name)
      _setPlantVisualState(mesh, crop, isDead, isHarv)

      mesh.scale.set(
        lerp(mesh.scale.x, tgtScale,        Math.min(1, dt * LERP_SPEED)),
        lerp(mesh.scale.y, tgtScale,        Math.min(1, dt * LERP_SPEED)),
        lerp(mesh.scale.z, tgtScale,        Math.min(1, dt * LERP_SPEED)),
      )
    }

    // soil colour
    const soils = gh.userData.soilMats || []
    const wPct  = ss?.resources?.water_l != null && INITIAL_WATER > 0
      ? ss.resources.water_l / INITIAL_WATER : 1
    const nPct  = ss?.resources?.nutrients_kg != null ? ss.resources.nutrients_kg / 200 : 1
    for (let si = 0; si < soils.length; si++) {
      const sm       = soils[si]
      const bedCrops = si < crops.length ? [crops[si]] : []
      if (bedCrops.length === 0) {
        sm.color.set('#1a1a10'); sm.emissive.set('#000000'); sm.emissiveIntensity = 0
      } else {
        const hasHarv = bedCrops.some(c => c.status === 'ready_to_harvest')
        const hasDead = bedCrops.some(c => c.status === 'dead' || c.status === 'wilted')
        if (hasDead)      sm.color.set('#3a2a18')
        else if (hasHarv) { sm.color.set('#2a2a12'); sm.color.lerp(new THREE.Color('#4a4020'), 0.3) }
        else              sm.color.set('#1a2010')
        const moisture = Math.max(0, Math.min(1, wPct * 2 - 0.4))
        sm.emissive.set('#1a3a5a')
        sm.emissiveIntensity = moisture * 0.15
        if (nPct < 0.15) sm.color.lerp(new THREE.Color('#4a1a1a'), 0.25)
      }
    }

    const shellMat = gh.userData.shellMat
    if (shellMat) {
      shellMat.color.lerpColors(
        new THREE.Color('#88ccbb'),
        new THREE.Color('#aacc44'),
        lv.co2Tint > 0.05 ? lv.co2Tint : 0,
      )
    }
  }
}
