import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BAND_COUNT, updateVoiceSignal, voiceSignal } from '../../conversation/voiceSignal.js';
import { bindUniforms } from '../bindUniforms.js';

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Rounded glowing bars, mirrored vertically like a voice print.
const fragment = /* glsl */ `
  #define N ${BAND_COUNT}
  uniform float uBands[N];
  uniform float uGlow;
  uniform float uMix;
  uniform float uAspect;
  varying vec2 vUv;

  void main() {
    float x = vUv.x * float(N);
    int i = int(clamp(floor(x), 0.0, float(N - 1)));
    float local = fract(x) - 0.5;
    float h = max(uBands[i], 0.035);

    // Capsule SDF in bar-width units.
    float r = 0.2;
    float py = (vUv.y - 0.5) * uAspect;
    float L = max(h * uAspect * 0.5 * 0.92 - r, 0.0);
    float d = length(vec2(local, max(abs(py) - L, 0.0))) - r;
    float core = 1.0 - smoothstep(0.0, 0.05, d);
    float glow = exp(-max(d, 0.0) * 4.5) * 0.4;

    float centre = 1.0 - abs(vUv.x - 0.5) * 1.3;
    vec3 col = mix(vec3(0.1, 0.55, 1.3), vec3(0.45, 1.3, 1.7), centre);
    float a = clamp(core + glow, 0.0, 1.0) * uMix;
    gl_FragColor = vec4(col * (core * 1.4 + glow) * uGlow, a);
  }
`;

// The AI's voice bars, shown in place of the smile while it speaks. Reads the
// shared voiceSignal every frame, so real audio drives it. `mix` (0..1) fades
// it in and out; `mood` says what the face is doing.
export default function Waveform({ width, height, mix, mood }) {
  const uniforms = useMemo(
    () => ({
      uBands: { value: new Array(BAND_COUNT).fill(0) },
      uGlow: { value: 1 },
      uMix: { value: 0 },
      uAspect: { value: height / (width / BAND_COUNT) },
    }),
    [width, height],
  );

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    updateVoiceSignal();
    const bands = uniforms.uBands.value;
    uniforms.uMix.value = mix();
    const talking = mood() === 'speaking';
    const speaking = talking && voiceSignal.source !== 'none';
    for (let i = 0; i < BAND_COUNT; i++) {
      const u = i / (BAND_COUNT - 1);
      const centre = 1 - Math.abs(u - 0.5) * 1.5;
      let target;
      if (speaking) target = voiceSignal.bands[i];
      else if (talking) target = 0.15 + 0.6 * centre * centre * (0.5 + 0.5 * Math.sin(t * 7 + u * 11)); // between syllables
      else target = 0.04 + 0.03 * centre * (0.5 + 0.5 * Math.sin(t * 1.6 + u * 6));
      // fast attack, slower release, like a VU meter
      const k = target > bands[i] ? 18 : 7;
      bands[i] += (target - bands[i]) * Math.min(1, k * dt);
    }
    uniforms.uGlow.value = 0.85 + (speaking ? voiceSignal.level * 0.6 : 0) + 0;
  });

  return (
    <mesh>
      <planeGeometry args={[width, height]} />
      <shaderMaterial
        vertexShader={vertex}
        fragmentShader={fragment}
        ref={bindUniforms(uniforms)}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
