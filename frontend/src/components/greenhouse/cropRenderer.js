import * as THREE from 'three'
import {
  CROP_COLORS, CROP_DEAD_COLOR, CROP_HARVEST_EMISSIVE,
  INITIAL_WATER, lerp,
} from './constants'

const STEM_COLOR        = '#3d6b2e'
const LEAF_FALLBACK_COLOR = '#4fa04b'
const MODEL_VISUAL_SCALE  = 2.8
const MIN_GROWTH_FACTOR   = 0.6
const MAX_GROWTH_FACTOR   = 1.25

const FRUIT_COLOR_BY_CROP = {
  tomato:  '#d63a2f',
  radish:  '#cc3a54',
  carrot:  '#e27f1a',
  potato:  '#8B7355',
  pea:     '#79bf59',
  soybean: '#9ACD32',
  wheat:   '#d2a450',
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

function _addPart(group, geom, mat, x=0,y=0,z=0, rx=0,ry=0,rz=0, sx=1,sy=1,sz=1) {
  const mesh = new THREE.Mesh(geom, mat)
  mesh.position.set(x, y, z)
  mesh.rotation.set(rx, ry, rz)
  mesh.scale.set(sx, sy, sz)
  group.add(mesh)
  return mesh
}

function _mat(color, roughness=0.65, metalness=0.03, emissive='#000') {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: 0, fog: false })
}

function _doubleMat(color, roughness=0.65) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02, side: THREE.DoubleSide, fog: false })
}

/* Flat elliptical leaf using PlaneGeometry */
function _leafMesh(mat, w=0.28, h=0.42) {
  const g = new THREE.PlaneGeometry(w, h, 3, 5)
  // pinch tip and base so it looks like a leaf
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const yN = pos.getY(i) / (h / 2)          // -1..1
    const taper = 1 - yN * yN * 0.55          // wider in middle
    pos.setX(i, pos.getX(i) * taper)
    // gentle midrib curve
    pos.setZ(i, Math.abs(pos.getX(i)) * -0.06)
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  return new THREE.Mesh(g, mat)
}

/* Arrange N leaves in a rosette from a central stem */
function _rosette(group, leafMat, count=8, stemH=0.38, spreadR=0.3, tiltMin=0.3, tiltMax=0.6) {
  for (let i = 0; i < count; i++) {
    const a   = (i / count) * Math.PI * 2 + (i % 2) * 0.18
    const tlt = tiltMin + (i % 3) * ((tiltMax - tiltMin) / 2)
    const lm  = _leafMesh(leafMat, 0.24, 0.44)
    lm.position.set(Math.cos(a) * spreadR * 0.4, stemH + (i%2)*0.03, Math.sin(a) * spreadR * 0.4)
    lm.rotation.set(tlt, a + Math.PI/2, 0)
    group.add(lm)
  }
}

/* ── LETTUCE ──────────────────────────────────────────────────────────────── */
function _buildLettuce(group) {
  const heartMat  = _doubleMat('#b5e882', 0.6)
  const outerMat  = _doubleMat('#4fa04b', 0.65)
  // tight inner head
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const lm = _leafMesh(heartMat, 0.18, 0.32)
    lm.position.set(Math.cos(a) * 0.08, 0.26, Math.sin(a) * 0.08)
    lm.rotation.set(0.15, a + Math.PI/2, 0)
    group.add(lm)
  }
  // outer spreading leaves
  for (let i = 0; i < 10; i++) {
    const a   = (i / 10) * Math.PI * 2 + 0.15
    const tlt = 0.5 + (i % 3) * 0.08
    const lm  = _leafMesh(outerMat, 0.28, 0.52)
    lm.position.set(Math.cos(a) * 0.22, 0.12, Math.sin(a) * 0.22)
    lm.rotation.set(tlt, a + Math.PI/2, 0)
    group.add(lm)
  }
  return [heartMat, outerMat]
}

/* ── KALE ─────────────────────────────────────────────────────────────────── */
function _buildKale(group) {
  const stemMat = _mat(STEM_COLOR, 0.72)
  const leafMat = _doubleMat('#2d6e3a', 0.65)
  // thick central stems with deeply ruffled leaves
  _addPart(group, new THREE.CylinderGeometry(0.05, 0.07, 0.55, 7), stemMat, 0, 0.28, 0)
  for (let i = 0; i < 9; i++) {
    const a   = (i / 9) * Math.PI * 2
    const h   = 0.35 + (i % 3) * 0.12
    const lm  = _leafMesh(leafMat, 0.3, 0.55)
    // wrinkle the leaf edges
    const pos = lm.geometry.attributes.position
    for (let v = 0; v < pos.count; v++) {
      const edge = Math.abs(pos.getX(v)) / 0.15
      pos.setZ(v, pos.getZ(v) + Math.sin(v * 1.8) * 0.04 * edge)
    }
    pos.needsUpdate = true
    lm.geometry.computeVertexNormals()
    lm.position.set(Math.cos(a) * 0.28, h, Math.sin(a) * 0.28)
    lm.rotation.set(0.4 + (i%2)*0.1, a + Math.PI/2, 0)
    group.add(lm)
  }
  return [stemMat, leafMat]
}

/* ── WHEAT ────────────────────────────────────────────────────────────────── */
function _buildWheat(group) {
  const stemMat  = _mat('#7aa457', 0.65)
  const bladeMat = _doubleMat('#88b45f', 0.6)
  const headMat  = _mat('#d6b05f', 0.55)
  const stalkN   = 6
  for (let i = 0; i < stalkN; i++) {
    const off = (i - (stalkN-1)/2) * 0.1
    const tilt = (i%2 === 0 ? 1 : -1) * 0.06
    // stem
    _addPart(group, new THREE.CylinderGeometry(0.018, 0.026, 1.1, 5), stemMat, off, 0.55, tilt*0.5)
    // blade leaf midway up
    const blade = _leafMesh(bladeMat, 0.1, 0.5)
    blade.position.set(off + Math.cos(i)*0.04, 0.52, tilt*0.5)
    blade.rotation.set(-0.4, i*1.1, tilt*1.5)
    group.add(blade)
    // seed head — elongated oval cluster
    _addPart(group, new THREE.CylinderGeometry(0.032, 0.048, 0.32, 6), headMat, off, 1.21, tilt*0.5, 0.05, 0, tilt)
    // small awns
    for (let aw = 0; aw < 4; aw++) {
      const awA = (aw/4)*Math.PI*2
      _addPart(group, new THREE.CylinderGeometry(0.005, 0.005, 0.15, 4), headMat,
        off + Math.cos(awA)*0.02, 1.3 + aw*0.03, tilt*0.5 + Math.sin(awA)*0.02,
        -0.25, awA, 0)
    }
  }
  return [stemMat, bladeMat, headMat]
}

/* ── TOMATO ───────────────────────────────────────────────────────────────── */
function _buildTomato(group) {
  const stemMat  = _mat('#3d7038', 0.66)
  const leafMat  = _doubleMat('#3a8c3a', 0.68)
  const fruitMat = _mat(FRUIT_COLOR_BY_CROP.tomato, 0.45)
  const calxMat  = _mat('#2d6e2d', 0.6)

  // main vine stem
  _addPart(group, new THREE.CylinderGeometry(0.055, 0.075, 1.0, 7), stemMat, 0, 0.5, 0)
  // compound leaves — pairs at intervals
  for (let tier = 0; tier < 3; tier++) {
    const yOff = 0.3 + tier * 0.28
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? 1 : -1
      const lm = _leafMesh(leafMat, 0.22, 0.38)
      lm.position.set(sign * 0.3, yOff, 0)
      lm.rotation.set(0.3, sign * 0.4, sign * 0.3)
      group.add(lm)
    }
  }
  // 4 ripe fruits with star calyx
  const fruitPositions = [[0.26,0.3,0.1],[-0.22,0.28,-0.12],[0.06,0.18,0.26],[-0.1,0.22,-0.24]]
  fruitPositions.forEach(([fx,fy,fz]) => {
    _addPart(group, new THREE.SphereGeometry(0.115, 12, 10), fruitMat, fx, fy, fz)
    // tiny calyx points
    for (let cp = 0; cp < 5; cp++) {
      const ca = (cp/5)*Math.PI*2
      _addPart(group, new THREE.ConeGeometry(0.014, 0.06, 4), calxMat,
        fx + Math.cos(ca)*0.06, fy+0.1, fz + Math.sin(ca)*0.06, -0.5, ca, 0)
    }
  })
  return [stemMat, leafMat, fruitMat, calxMat]
}

/* ── POTATO ───────────────────────────────────────────────────────────────── */
function _buildPotato(group) {
  const stemMat  = _mat('#4f7a42', 0.68)
  const leafMat  = _doubleMat('#4d8c44', 0.68)
  const tuberMat = _mat(FRUIT_COLOR_BY_CROP.potato, 0.85)

  // bushy above-ground foliage
  _addPart(group, new THREE.CylinderGeometry(0.05, 0.07, 0.7, 7), stemMat, 0, 0.35, 0)
  for (let b = 0; b < 3; b++) {
    const bA = (b/3)*Math.PI*2
    _addPart(group, new THREE.CylinderGeometry(0.03, 0.04, 0.45, 6), stemMat,
      Math.cos(bA)*0.12, 0.6, Math.sin(bA)*0.12, 0, bA, 0.25)
    for (let l = 0; l < 3; l++) {
      const la = bA + (l-1)*0.45
      const lm = _leafMesh(leafMat, 0.2, 0.34)
      lm.position.set(Math.cos(bA)*0.26, 0.7+l*0.05, Math.sin(bA)*0.26)
      lm.rotation.set(0.35, la + Math.PI/2, 0)
      group.add(lm)
    }
  }
  // tubers peeking below soil line
  _addPart(group, new THREE.SphereGeometry(0.17, 10, 8), tuberMat, -0.16, -0.08, 0.1, 0,0,0, 1.15, 0.8, 0.95)
  _addPart(group, new THREE.SphereGeometry(0.14, 10, 8), tuberMat,  0.15, -0.1, -0.1, 0,0,0, 1.1,  0.78, 0.9)
  _addPart(group, new THREE.SphereGeometry(0.11, 10, 8), tuberMat, -0.06, -0.12, -0.2, 0,0,0, 1.05, 0.75, 0.85)
  return [stemMat, leafMat, tuberMat]
}

/* ── CARROT ───────────────────────────────────────────────────────────────── */
function _buildCarrot(group) {
  const rootMat  = _mat(FRUIT_COLOR_BY_CROP.carrot, 0.7)
  const stemMat  = _mat('#3a7a30', 0.68)
  const fernMat  = _doubleMat('#52a848', 0.65)

  // taproot — mostly below soil
  _addPart(group, new THREE.ConeGeometry(0.11, 0.88, 10), rootMat, 0, -0.52, 0, Math.PI, 0, 0)
  // slight crown above soil
  _addPart(group, new THREE.SphereGeometry(0.06, 8, 6), rootMat, 0, 0.02, 0, 0,0,0, 1, 0.5, 1)
  // short neck
  _addPart(group, new THREE.CylinderGeometry(0.035, 0.045, 0.16, 7), stemMat, 0, 0.12, 0)

  // feathery fern-like fronds
  const frondN = 10
  for (let i = 0; i < frondN; i++) {
    const a   = (i / frondN) * Math.PI * 2
    const h   = 0.5 + (i % 3) * 0.1
    const lm  = _leafMesh(fernMat, 0.07, h)
    lm.position.set(Math.cos(a) * 0.06, 0.22 + h * 0.5, Math.sin(a) * 0.06)
    lm.rotation.set(-0.18, a + Math.PI/2, 0.1)
    group.add(lm)
    // secondary pinnae
    for (let p = 0; p < 3; p++) {
      const py = 0.3 + p * (h * 0.25)
      const pm = _leafMesh(fernMat, 0.06, 0.12)
      const sign = p % 2 === 0 ? 1 : -1
      pm.position.set(Math.cos(a)*0.07 + Math.cos(a + Math.PI/2)*sign*0.08, py, Math.sin(a)*0.07 + Math.sin(a+Math.PI/2)*sign*0.08)
      pm.rotation.set(-0.3, a + Math.PI/2 + sign*0.5, 0)
      group.add(pm)
    }
  }
  return [rootMat, stemMat, fernMat]
}

/* ── RADISH ───────────────────────────────────────────────────────────────── */
function _buildRadish(group) {
  const bulbMat = _mat(FRUIT_COLOR_BY_CROP.radish, 0.55)
  const whiteMat= _mat('#f0eeea', 0.6)
  const leafMat = _doubleMat('#4da850', 0.65)

  // rounded bulb, white lower half
  _addPart(group, new THREE.SphereGeometry(0.185, 12, 10), bulbMat, 0, 0.07, 0, 0,0,0, 1, 0.9, 1)
  _addPart(group, new THREE.SphereGeometry(0.185, 12, 10), whiteMat, 0, -0.04, 0, 0,0,0, 1, 0.5, 1)
  // thin taproot
  _addPart(group, new THREE.ConeGeometry(0.025, 0.3, 7), whiteMat, 0, -0.22, 0, Math.PI, 0, 0)

  // upright to slightly spreading leaves
  for (let i = 0; i < 7; i++) {
    const a   = (i / 7) * Math.PI * 2
    const tlt = 0.18 + (i % 3) * 0.1
    const lm  = _leafMesh(leafMat, 0.22, 0.5)
    lm.position.set(Math.cos(a) * 0.1, 0.34, Math.sin(a) * 0.1)
    lm.rotation.set(tlt, a + Math.PI/2, 0)
    group.add(lm)
  }
  return [bulbMat, whiteMat, leafMat]
}

/* ── PEA ──────────────────────────────────────────────────────────────────── */
function _buildPea(group) {
  const stemMat  = _mat('#5a9f4a', 0.67)
  const leafMat  = _doubleMat('#5db050', 0.65)
  const tendMat  = _mat('#78c466', 0.6)
  const podMat   = _mat(FRUIT_COLOR_BY_CROP.pea, 0.58)

  // vine stem
  _addPart(group, new THREE.CylinderGeometry(0.03, 0.04, 1.05, 6), stemMat, 0, 0.53, 0)

  // paired leaflets at 3 heights
  for (let t = 0; t < 3; t++) {
    const y = 0.28 + t * 0.28
    for (let s = 0; s < 2; s++) {
      const sign = s === 0 ? 1 : -1
      const lm   = _leafMesh(leafMat, 0.18, 0.3)
      lm.position.set(sign * 0.22, y, 0)
      lm.rotation.set(0.2, sign * 0.35, sign * 0.2)
      group.add(lm)
    }
    // curling tendril
    const tc = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.12, y+0.02, 0),
        new THREE.Vector3(0.2,  y+0.08, 0.08),
        new THREE.Vector3(0.24, y+0.14, -0.04),
        new THREE.Vector3(0.2,  y+0.18, -0.1),
      ]), 12, 0.008, 4, false)
    group.add(new THREE.Mesh(tc, tendMat))
  }

  // 3 fat pods
  const podData = [[0.22,0.38, 0.08],[-0.2,0.26,-0.06],[0.08,0.14,0.22]]
  podData.forEach(([px,py,pz]) => {
    _addPart(group, new THREE.CapsuleGeometry(0.048, 0.26, 4, 8), podMat, px, py, pz, 0.15, 0.3, 1.1)
    // pea bumps along pod
    for (let pb = 0; pb < 3; pb++) {
      _addPart(group, new THREE.SphereGeometry(0.04, 8, 6), podMat,
        px + Math.cos(pb*1.05)*0.04, py - 0.08 + pb*0.09, pz + Math.sin(pb*1.05)*0.04)
    }
  })
  return [stemMat, leafMat, tendMat, podMat]
}

/* ── SOYBEAN ──────────────────────────────────────────────────────────────── */
function _buildSoybean(group) {
  const stemMat  = _mat('#5e9f50', 0.67)
  const leafMat  = _doubleMat('#68b058', 0.65)
  const podMat   = _mat(FRUIT_COLOR_BY_CROP.soybean, 0.62)

  _addPart(group, new THREE.CylinderGeometry(0.04, 0.055, 0.88, 7), stemMat, 0, 0.44, 0)

  // trifoliate leaves — 3 leaflets per node, 3 nodes
  for (let n = 0; n < 3; n++) {
    const y = 0.22 + n * 0.26
    for (let lf = 0; lf < 3; lf++) {
      const a  = (lf / 3) * Math.PI * 2 + n * 0.4
      const lm = _leafMesh(leafMat, 0.2, 0.35)
      lm.position.set(Math.cos(a) * 0.28, y, Math.sin(a) * 0.28)
      lm.rotation.set(0.25, a + Math.PI/2, 0)
      group.add(lm)
    }
  }

  // hairy pods clustered on stem
  for (let i = 0; i < 6; i++) {
    const a  = (i/6)*Math.PI*2
    const y  = 0.2 + (i%3)*0.22
    _addPart(group, new THREE.CapsuleGeometry(0.038, 0.22, 4, 8), podMat,
      Math.cos(a)*0.14, y, Math.sin(a)*0.14, 0.1, a, 0.8)
  }
  return [stemMat, leafMat, podMat]
}

/* ── dispatch ─────────────────────────────────────────────────────────────── */

function _buildCropVisual(cropName) {
  const kind = String(cropName || '').toLowerCase()
  const g    = new THREE.Group()
  let mats   = []
  switch (kind) {
    case 'wheat':   mats = _buildWheat(g);   break
    case 'tomato':  mats = _buildTomato(g);  break
    case 'potato':  mats = _buildPotato(g);  break
    case 'carrot':  mats = _buildCarrot(g);  break
    case 'radish':  mats = _buildRadish(g);  break
    case 'pea':     mats = _buildPea(g);     break
    case 'soybean': mats = _buildSoybean(g); break
    case 'lettuce': mats = _buildLettuce(g); break
    case 'kale':    mats = _buildKale(g);    break
    default:        mats = _buildLettuce(g); break
  }
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
  const accent    = FRUIT_COLOR_BY_CROP[kind] || liveColor
  for (const mat of mats) {
    if (!mat?.color) continue
    if (isDead) {
      mat.color.set(CROP_DEAD_COLOR)
      mat.emissive?.set('#000000')
      mat.emissiveIntensity = 0
      continue
    }
    const hex = `#${mat.color.getHexString()}`
    const isFruit = hex === accent || hex === FRUIT_COLOR_BY_CROP.tomato
    mat.color.set(isFruit ? accent : liveColor)
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
  if (!ss?.crops) return

  const domeCrops = distributeCrops(ss.crops, domeDefs)
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
        lerp(mesh.scale.y, tgtScale * 1.45, Math.min(1, dt * LERP_SPEED)),
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
