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
    FRUSTUM, -FRUSTUM, 0.1, 200
  )
  camera.position.set(0, 160, 0)
  camera.lookAt(0, 0, 0)
  camera.zoom = ZOOM_DEFAULT
  camera.updateProjectionMatrix()

  return { renderer, scene, camera }
}

export function buildTerrain(scene) {
  const marsTexture = new THREE.TextureLoader().load('/mars-texture.jpg')
  marsTexture.colorSpace = THREE.SRGBColorSpace
  marsTexture.wrapS = THREE.RepeatWrapping
  marsTexture.wrapT = THREE.RepeatWrapping
  // Show more of the texture (less zoom).
  marsTexture.repeat.set(1.5, 1.5)
  marsTexture.offset.set(0, 0)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
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
  sun.shadow.camera.left = -120
  sun.shadow.camera.right = 120
  sun.shadow.camera.top = 120
  sun.shadow.camera.bottom = -120
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 300
  sun.shadow.bias = -0.0005
  scene.add(sun)
  return { sun, ambient, fill }
}
