import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { bindUniforms } from '../bindUniforms.js';

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  attribute vec3 aSeed; // x: phase, y: speed, z: size
  attribute float aOrbit; // 1 = orbiting ring around the bearing
  varying float vAlpha;

  void main() {
    vec3 p = position;
    float t = uTime * aSeed.y;
    if (aOrbit > 0.5) {
      // slow orbit on a tilted ellipse around the bearing
      float a = atan(p.z, p.x) + t * 0.25;
      float r = length(p.xz);
      p = vec3(cos(a) * r, p.y + sin(a * 3.0 + aSeed.x) * 0.05, sin(a) * r);
      p.yz = mat2(cos(0.35), -sin(0.35), sin(0.35), cos(0.35)) * p.yz;
    } else {
      // gentle upward drift with a little sway, wrapping vertically
      p.y = mod(p.y + t * 0.25 + 4.0, 8.0) - 4.0;
      p.x += sin(t + aSeed.x * 6.28) * 0.15;
      p.z += cos(t * 0.8 + aSeed.x * 6.28) * 0.1;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.55 + 0.45 * sin(uTime * 2.0 * aSeed.y + aSeed.x * 40.0);
    vAlpha = twinkle * smoothstep(4.0, 2.5, abs(p.y));
    gl_PointSize = uSize * aSeed.z * uPixelRatio * (8.0 / -mv.z);
  }
`;

const fragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    gl_FragColor = vec4(vec3(0.35, 0.85, 1.6) * a * vAlpha, a * vAlpha);
  }
`;

// Floating luminous dust plus a faint orbiting ring of sparks.
export default function Particles({ count = 500, reducedMotion }) {
  const { geometry, uniforms } = useMemo(() => {
    const orbitCount = Math.floor(count * 0.35);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 3);
    const orbit = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      if (i < orbitCount) {
        const a = Math.random() * Math.PI * 2;
        const r = 2.05 + (Math.random() - 0.5) * 0.35;
        pos.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.12, Math.sin(a) * r], i * 3);
        orbit[i] = 1;
      } else {
        // keep a clear pocket in front of the bearing face
        let x, z;
        do {
          x = (Math.random() - 0.5) * 11;
          z = -3 + Math.random() * 4.5;
        } while (Math.abs(x) < 1.9 && z > -0.5);
        pos.set([x, (Math.random() - 0.5) * 8, z], i * 3);
      }
      seed.set([Math.random(), 0.3 + Math.random() * 0.7, 0.4 + Math.random() * 1.0], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('aOrbit', new THREE.BufferAttribute(orbit, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);
    return {
      geometry: g,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uSize: { value: 5 },
      },
    };
  }, [count]);

  useFrame((_, dt) => {
    uniforms.uTime.value += dt * (reducedMotion ? 0.25 : 1);
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        vertexShader={vertex}
        fragmentShader={fragment}
        ref={bindUniforms(uniforms)}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}
