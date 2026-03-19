export const FRUSTUM = 80
export const DOME_OPACITY = 0.4
export const ZOOM_DEFAULT = 1.0
export const ZOOM_ENTERED = 6.0
export const ZOOM_ALL = 1.05
export const ANIM_DURATION = 1.2

export const CROP_COLORS = {
  lettuce: '#33cc55', potato: '#8B7355', wheat: '#DAA520', tomato: '#FF6347',
  soybean: '#9ACD32', spinach: '#33cc55', radish: '#FF4500', pea: '#90EE90',
  kale: '#228B22', carrot: '#FF8C00',
}
export const CROP_EMPTY_COLOR = '#3a2a1e'
export const CROP_DEAD_COLOR  = '#8B4513'
export const CROP_HARVEST_EMISSIVE = '#FFD700'
export const INITIAL_WATER = 4800

export const DOME_DEFS_BASE = [
  { id: 'DOME_01', x: 0, z: 0, r: 24 },
]

export const MIN_DOME_R = 8
export const MAX_DOME_R = 35

export function compassDir(deg) {
  const d = ['N','NE','E','SE','S','SW','W','NW']
  return d[Math.round(((deg % 360) + 360) % 360 / 45) % 8]
}

export function lerp(a, b, t) { return a + (b - a) * t }

export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

export function scaleDomeDefs(floorSpaceM2) {
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
