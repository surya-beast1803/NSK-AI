import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { bindUniforms } from '../bindUniforms.js';

const discVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Concentric holographic rings with a slow outward pulse and tick marks.
const discFragment = /* glsl */ `
  uniform float uTime;
  uniform float uActive;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float aa = fwidth(r) * 1.5;
    float ring = 0.0;
    ring += 1.0 - smoothstep(0.0, aa * 1.5, abs(r - 0.96));
    ring += (1.0 - smoothstep(0.0, aa * 2.0, abs(r - 0.82))) * 0.7;
    ring += (1.0 - smoothstep(0.0, aa, abs(r - 0.62))) * 0.5;
    ring += (1.0 - smoothstep(0.0, aa, abs(r - 0.4))) * 0.35;
    float ticks = step(0.5, fract(a * 24.0 / 6.2832 + uTime * 0.05)) * (1.0 - smoothstep(0.0, 0.02, abs(r - 0.89)));
    float dashes = step(0.7, fract(a * 6.0 / 6.2832 - uTime * 0.08)) * (1.0 - smoothstep(0.0, aa * 2.0, abs(r - 0.72)));
    float pulse = exp(-abs(r - fract(uTime * 0.18)) * 30.0) * 0.5 * (1.0 - r);
    float fill = (1.0 - smoothstep(0.0, 1.0, r)) * 0.22;
    float v = ring + ticks * 0.6 + dashes * 0.6 + pulse + fill;
    v *= (0.85 + 0.35 * uActive);
    vec3 col = vec3(0.2, 0.7, 1.5) * v;
    gl_FragColor = vec4(col, clamp(v, 0.0, 1.0));
  }
`;

const beamFragment = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float fade = pow(1.0 - vUv.y, 2.2);
    float streaks = 0.75 + 0.25 * sin(vUv.x * 60.0 + uTime * 0.6) * sin(vUv.x * 23.0 - uTime * 0.3);
    float v = fade * streaks * 0.16;
    gl_FragColor = vec4(vec3(0.2, 0.65, 1.4) * v, v);
  }
`;

export default function HoloPlatform({ y = -2.05, active = false }) {
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uActive: { value: 0 } }), []);
  useFrame((_, dt) => {
    uniforms.uTime.value += dt;
    uniforms.uActive.value += ((active ? 1 : 0) - uniforms.uActive.value) * Math.min(1, dt * 3);
  });

  return (
    <group position={[0, y, 0]}>
      {/* metal plinth */}
      <mesh position={[0, -0.12, 0]} receiveShadow>
        <cylinderGeometry args={[2.0, 2.15, 0.22, 72, 1]} />
        <meshPhysicalMaterial color="#1a2433" metalness={0.9} roughness={0.32} clearcoat={0.5} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]}>
        <circleGeometry args={[2.0, 72]} />
        <meshPhysicalMaterial color="#0a1220" metalness={0.8} roughness={0.15} clearcoat={1} />
      </mesh>
      {/* glowing rings */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <planeGeometry args={[4.6, 4.6]} />
        <shaderMaterial
          vertexShader={discVertex}
          fragmentShader={discFragment}
          ref={bindUniforms(uniforms)}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          extensions={{ derivatives: true }}
        />
      </mesh>
      {/* soft upward light column */}
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[1.75, 1.95, 3.2, 48, 1, true]} />
        <shaderMaterial
          vertexShader={discVertex}
          fragmentShader={beamFragment}
          ref={bindUniforms(uniforms)}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
