import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function buildStarBuffers(n) {
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const r = 50 + Math.random() * 100
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
  }
  const sizes = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    sizes[i] = 0.1 + Math.random() * 0.4
  }
  return { positions, sizes }
}

export default function Stars({ count = 3000 }) {
  const ref = useRef()
  const [{ positions, sizes }] = useState(() => buildStarBuffers(count))

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.003
      ref.current.rotation.x += delta * 0.001
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={count}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.25}
        color="#ffffff"
        sizeAttenuation
        transparent
        opacity={0.8}
      />
    </points>
  )
}
