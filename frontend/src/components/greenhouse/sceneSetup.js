import * as THREE from 'three'
import { FRUSTUM, ZOOM_DEFAULT } from './constants'

export function initScene(canvas, w, h) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
  })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#1a0a04')

  const aspect = w / h
  const camera = new THREE.OrthographicCamera(
    -FRUSTUM * aspect, FRUSTUM * aspect,
    FRUSTUM, -FRUSTUM, 0.1, 2000
  )
  camera.position.set(0, 160, 0)
  camera.lookAt(0, 0, 0)
  camera.zoom = ZOOM_DEFAULT
  camera.updateProjectionMatrix()

  return { renderer, scene, camera }
}

export function buildTerrain(scene) {
  const marsTexture = new THREE.TextureLoader().load('/mars-ground.png')
  marsTexture.colorSpace = THREE.SRGBColorSpace
  marsTexture.wrapS = THREE.RepeatWrapping
  marsTexture.wrapT = THREE.RepeatWrapping
  // Keep original image proportions so rocks/terrain details are not stretched.
  // Tile cell ratio should match image ratio: cellW/cellH = imgW/imgH.
  const tileY = 12
  const imgW = marsTexture.image?.width || 1
  const imgH = marsTexture.image?.height || 1
  const aspect = imgW / imgH
  const tileX = tileY / aspect
  marsTexture.repeat.set(tileX, tileY)
  marsTexture.offset.set(0, 0)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3200, 3200),
    new THREE.MeshStandardMaterial({ map: marsTexture, roughness: 0.95 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = 0.08
  ground.receiveShadow = true
  scene.add(ground)
}

export function setupLighting(scene) {
  const ambient = new THREE.AmbientLight('#441a00', 0.35)
  scene.add(ambient)

  const fill = new THREE.DirectionalLight('#ff8844', 0.3)
  fill.position.set(0, -10, 0)
  scene.add(fill)

  const sun = new THREE.DirectionalLight('#ffe8cc', 2.2)
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)
  sun.shadow.camera.left = -200
  sun.shadow.camera.right = 200
  sun.shadow.camera.top = 200
  sun.shadow.camera.bottom = -200
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 500
  sun.shadow.bias = -0.0005
  scene.add(sun)
  return { sun, ambient, fill }
}
