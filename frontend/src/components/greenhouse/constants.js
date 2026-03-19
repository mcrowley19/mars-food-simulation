export const FRUSTUM = 80
export const DOME_OPACITY = 0.4
export const ZOOM_DEFAULT = 1.0
export const ZOOM_ENTERED = 2.0
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
  { id: 'DOME_01', x:  0,   z:  0,   r: 24  },
  { id: 'DOME_02', x: -48,  z: -14,  r: 18  },
  { id: 'DOME_03', x:  44,  z: -20,  r: 20  },
  { id: 'DOME_04', x: -20,  z:  42,  r: 15  },
  { id: 'DOME_05', x:  28,  z:  36,  r: 16  },
  { id: 'DOME_06', x: -55,  z:  28,  r: 12  },
  { id: 'DOME_07', x:  62,  z:  16,  r: 14  },
]

export const MIN_DOME_R = 8
export const MAX_DOME_R = 35

export const TUNNELS = [
  ['DOME_01', 'DOME_02'],
  ['DOME_01', 'DOME_03'],
  ['DOME_01', 'DOME_04'],
  ['DOME_01', 'DOME_05'],
  ['DOME_04', 'DOME_06'],
  ['DOME_03', 'DOME_07'],
]

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
