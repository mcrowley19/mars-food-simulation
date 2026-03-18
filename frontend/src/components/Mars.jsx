import { useRef } from 'react'
import { useFrame, useLoader, useThree, extend } from '@react-three/fiber'
import * as THREE from 'three'
import { shaderMaterial } from '@react-three/drei'

const AtmosphereMaterial = shaderMaterial(
  {
    glowColorDay: new THREE.Color('#e06a3a'),
    glowColorNight: new THREE.Color('#8d3a2a'),
    lightDirection: new THREE.Vector3(5, 2, 5).normalize(),
    intensity: 0.16,
    falloff: 5.2,
  },
  /* vertex */
  `
    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  /* fragment */
  `
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
)

extend({ AtmosphereMaterial })

export default function Mars({ dashboardActive = false }) {
  const containerRef = useRef()
  const spinRef = useRef()
  const transitionRef = useRef(0)
  const { gl } = useThree()

  const marsTexture = useLoader(THREE.TextureLoader, '/mars-texture.jpg')
  marsTexture.colorSpace = THREE.SRGBColorSpace
  marsTexture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
  marsTexture.needsUpdate = true

  useFrame((_, delta) => {
    if (spinRef.current) {
      spinRef.current.rotation.y += delta * 0.06
    }

    if (containerRef.current) {
      const targetProgress = dashboardActive ? 1 : 0
      transitionRef.current = THREE.MathUtils.damp(
        transitionRef.current,
        targetProgress,
        4.4,
        delta
      )

      // Smoothstep easing for cleaner accel/decel on both directions.
      const t = transitionRef.current
      const eased = t * t * (3 - 2 * t)

      const x = THREE.MathUtils.lerp(0, -1.15, eased)
      const scale = THREE.MathUtils.lerp(1, 0.6, eased)

      containerRef.current.position.x = x
      containerRef.current.scale.setScalar(scale)
    }
  })

  return (
    <group ref={containerRef}>
      <group ref={spinRef} rotation={[0.4, 0, 0.08]}>
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
          <atmosphereMaterial
            transparent
            side={THREE.BackSide}
            depthWrite={false}
            blending={THREE.NormalBlending}
          />
        </mesh>
      </group>
    </group>
  )
}
