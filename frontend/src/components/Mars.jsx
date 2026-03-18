import { useRef } from 'react'
import { useFrame, useLoader, extend } from '@react-three/fiber'
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

export default function Mars() {
  const groupRef = useRef()

  const marsTexture = useLoader(THREE.TextureLoader, '/mars-texture.jpg')
  marsTexture.colorSpace = THREE.SRGBColorSpace
  marsTexture.anisotropy = 8

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.06
    }
  })

  return (
    <group ref={groupRef} rotation={[0.4, 0, 0.08]}>
      <mesh>
        <sphereGeometry args={[1.6, 128, 128]} />
        <meshStandardMaterial
          map={marsTexture}
          roughness={0.9}
          metalness={0.05}
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
  )
}
