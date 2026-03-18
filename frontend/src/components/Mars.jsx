import { useRef, useMemo } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const ATMO_VERTEX = `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const ATMO_FRAGMENT = `
  uniform vec3 glowColorDay;
  uniform vec3 glowColorNight;
  uniform vec3 lightDirection;
  uniform float intensity;
  uniform float falloff;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 sunDir = normalize(lightDirection);

    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), falloff);
    float sunAmount = max(dot(normal, sunDir), 0.0);
    float dayBlend = smoothstep(0.1, 0.5, sunAmount);

    vec3 glowColor = mix(glowColorNight, glowColorDay, dayBlend);
    float alpha = fresnel * intensity * mix(0.2, 0.55, dayBlend);
    gl_FragColor = vec4(glowColor, alpha);
  }
`

export default function Mars() {
  const groupRef = useRef()
  const { gl } = useThree()

  const marsTexture = useLoader(THREE.TextureLoader, '/mars-texture.jpg')

  // Configure texture properties ONCE — not every render.
  // Re-setting needsUpdate each frame races with Mesa's async texture upload
  // pipeline and produces a blank sphere on AMD/Intel Linux drivers.
  useMemo(() => {
    marsTexture.colorSpace = THREE.SRGBColorSpace
    marsTexture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    marsTexture.generateMipmaps = true
    marsTexture.minFilter = THREE.LinearMipmapLinearFilter
    marsTexture.magFilter = THREE.LinearFilter
    marsTexture.needsUpdate = true
  }, [marsTexture, gl])

  // Build the atmosphere ShaderMaterial as a plain instance so we don't
  // depend on the drei extend() / JSX registry — which can silently fail
  // and crash the whole render loop on some Mesa driver + R3F combos.
  const atmosphereMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          glowColorDay: { value: new THREE.Color('#e06a3a') },
          glowColorNight: { value: new THREE.Color('#8d3a2a') },
          lightDirection: { value: new THREE.Vector3(5, 2, 5).normalize() },
          intensity: { value: 0.16 },
          falloff: { value: 5.2 },
        },
        vertexShader: ATMO_VERTEX,
        fragmentShader: ATMO_FRAGMENT,
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    []
  )

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.06
    }
  })

  return (
    <group ref={groupRef} rotation={[0.4, 0, 0.08]} position={[0, 0, 0]}>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[1.6, 128, 128]} />
        <meshStandardMaterial
          map={marsTexture}
          roughness={0.9}
          metalness={0.05}
          toneMapped={true}
        />
      </mesh>

      <mesh scale={[1.03, 1.03, 1.03]}>
        <sphereGeometry args={[1.6, 96, 96]} />
        <primitive object={atmosphereMaterial} attach="material" />
      </mesh>
    </group>
  )
}
