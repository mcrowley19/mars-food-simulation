import * as THREE from 'three'
import {
  CROP_COLORS, CROP_DEAD_COLOR, CROP_HARVEST_EMISSIVE,
  INITIAL_WATER, lerp,
} from './constants'

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
      if (planters[pi]) planters[pi].visible = hasCrop
      if (soilMeshes[pi]) soilMeshes[pi].visible = hasCrop
      const mesh = plants[pi]
      mesh.visible = hasCrop
      if (!hasCrop) continue
      const mat = mesh.material
      const base = mesh.userData.baseScale || 0.12
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
