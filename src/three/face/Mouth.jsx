import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { bindUniforms } from '../bindUniforms.js';

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A glowing smile line that dynamically transforms into a cybernetic loading pulse
// while the AI is thinking, and fades while voice bars take its place when speaking.
const fragment = /* glsl */ `
  uniform float uSmile;
  uniform float uOpen;
  uniform float uFade;
  uniform float uGlow;
  uniform float uAspect;
  uniform float uThinking;
  uniform float uTime;
  varying vec2 vUv;

  const float HALF = 0.62; // half the smile's length, in half-widths
  const float THICK = 0.022;

  void main() {
    float X = (vUv.x - 0.5) * 2.0;
    float Y = (vUv.y - 0.5) * 2.0 * uAspect;
    float x = clamp(X, -HALF, HALF);
    float k = uSmile * 0.17;
    float u = x / HALF;
    float yc = k * (u * u - 0.35);
    float slope = 2.0 * k * x / (HALF * HALF);

    float dy = (Y - yc) / sqrt(1.0 + slope * slope);
    float dLine = length(vec2(max(abs(X) - HALF, 0.0), dy)) - THICK;
    // open grin: the lower lip drops below the line
    float yl = yc - uOpen * 0.2 * (1.0 - u * u);
    float dOpen = max(max(Y - yc, yl - Y), abs(X) - HALF);
    float d = min(dLine, dOpen);

    float aa = fwidth(d) + 0.002;
    float core = 1.0 - smoothstep(-aa, aa, d);
    float glow = exp(-max(d, 0.0) * 18.0) * (1.0 - core) * 0.6;
    vec3 col = mix(vec3(0.1, 0.55, 1.4), vec3(0.35, 0.95, 1.7), 1.0 - abs(u));
    float smileAlpha = clamp(core + glow, 0.0, 1.0) * (1.0 - uFade);
    vec3 smileColor = col * (core * 1.2 + glow) * uGlow;

    // --- Cyber loading indicator in mouth during thinking ---
    vec3 loadColor = vec3(0.0);
    float loadAlpha = 0.0;

    if (uThinking > 0.001) {
      // 3 glowing data nodes pulsing sequentially
      float dotCores = 0.0;
      float dotGlows = 0.0;

      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float px = (fi - 1.0) * 0.34;
        float phase = uTime * 5.8 - fi * 1.28;
        float pulse = 0.5 + 0.5 * sin(phase);
        float py = sin(phase) * 0.038;

        float dist = length(vec2(X - px, Y - py));
        float rad = 0.032 + pulse * 0.024;
        float dDot = dist - rad;

        float dCore = 1.0 - smoothstep(0.0, 0.016, dDot);
        float dGlow = exp(-max(dDot, 0.0) * 16.0) * (0.45 + 0.55 * pulse);

        dotCores += dCore;
        dotGlows += dGlow;
      }

      // Connecting energy thread between nodes
      float beamDist = length(vec2(max(abs(X) - 0.38, 0.0), Y)) - 0.01;
      float beamCore = (1.0 - smoothstep(0.0, 0.014, beamDist)) * 0.45;
      float beamGlow = exp(-max(beamDist, 0.0) * 22.0) * 0.35;

      // Scanning photon wave traveling back and forth
      float scanX = sin(uTime * 4.0) * 0.4;
      float scanDist = length(vec2(X - scanX, Y * 1.8));
      float scanGlow = exp(-scanDist * 20.0) * 0.85;

      float totalCore = clamp(dotCores + beamCore * 0.5, 0.0, 1.0);
      float totalGlow = dotGlows + beamGlow + scanGlow;

      vec3 cyanColor = mix(vec3(0.12, 0.65, 1.6), vec3(0.38, 1.05, 2.0), 0.5 + 0.5 * sin(uTime * 2.4));
      vec3 coreWhite = vec3(0.96, 0.99, 1.0);
      loadColor = mix(cyanColor * totalGlow, coreWhite * 1.35, totalCore) * uGlow;
      loadAlpha = clamp(totalCore + totalGlow * 0.8, 0.0, 1.0) * (1.0 - uFade);
    }

    vec3 finalCol = mix(smileColor, loadColor, uThinking);
    float finalAlpha = mix(smileAlpha * (1.0 - uThinking), loadAlpha, uThinking);

    gl_FragColor = vec4(finalCol, finalAlpha);
  }
`;

export default function Mouth({ width, height, params }) {
  const uniforms = useMemo(
    () => ({
      uSmile: { value: 0.7 },
      uOpen: { value: 0 },
      uFade: { value: 0 },
      uGlow: { value: 1 },
      uAspect: { value: height / width },
      uThinking: { value: 0 },
      uTime: { value: 0 },
    }),
    [width, height],
  );

  useFrame(({ clock }) => {
    const m = params();
    uniforms.uSmile.value = m.smile;
    uniforms.uOpen.value = m.open;
    uniforms.uFade.value = m.bars;
    uniforms.uThinking.value = m.thinking ?? 0;
    uniforms.uTime.value = clock.elapsedTime;
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
