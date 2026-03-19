import * as THREE from 'three'
import {
  CROP_COLORS, CROP_EMPTY_COLOR, CROP_DEAD_COLOR, CROP_HARVEST_EMISSIVE,
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

export function updateCropsAndBeds(greenhouses, domeDefs, ss, lv, dt, now) {
  const LERP_SPEED = 4
  if (!ss?.crops) return

  const domeCrops = distributeCrops(ss.crops, domeDefs)
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

    const soils = gh.userData.soilMats || []
    const wPct = ss?.resources?.water_l != null && INITIAL_WATER > 0
      ? ss.resources.water_l / INITIAL_WATER : 1
    const nPct = ss?.resources?.nutrients_kg != null
      ? ss.resources.nutrients_kg / 200 : 1
    const PLANTS_PER_BED = 5
    for (let si = 0; si < soils.length; si++) {
      const sm = soils[si]
      const bedStart = si * PLANTS_PER_BED
      const bedCrops = crops.slice(bedStart, bedStart + PLANTS_PER_BED)
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
