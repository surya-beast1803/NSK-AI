import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { assets } from '../../config/appConfig.js';
import { bindUniforms } from '../bindUniforms.js';

const DEPTH = -9;

// Paints an out-of-focus industrial lab: ceiling light strips, server racks
// with cyan status screens, and a glossy floor. Drawn once, at load.
function paintLab(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const sx = w / 2048;
  const sy = h / 1024;
  g.scale(sx, sy);
  const W = 2048;
  const H = 1024;
  const horizon = 640;

  let grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#040d1f');
  grad.addColorStop(0.45, '#0a2142');
  grad.addColorStop(0.62, '#0c2a52');
  grad.addColorStop(0.7, '#061328');
  grad.addColorStop(1, '#020713');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // far wall panels
  g.strokeStyle = 'rgba(80,150,220,0.08)';
  g.lineWidth = 2;
  for (let x = 560; x < 1500; x += 70) {
    g.beginPath();
    g.moveTo(x, 220);
    g.lineTo(x, horizon);
    g.stroke();
  }
  for (let y = 260; y < horizon; y += 60) {
    g.beginPath();
    g.moveTo(560, y);
    g.lineTo(1490, y);
    g.stroke();
  }

  // ceiling light strips converging towards the centre
  for (let i = 0; i < 5; i++) {
    const y = 40 + i * 42;
    const half = 820 - i * 120;
    const thick = 14 - i * 2;
    g.fillStyle = `rgba(190,235,255,${0.75 - i * 0.12})`;
    g.shadowColor = 'rgba(120,210,255,0.9)';
    g.shadowBlur = 30;
    g.fillRect(W / 2 - half, y, half * 0.55, thick);
    g.fillRect(W / 2 + half * 0.45, y, half * 0.55, thick);
  }
  g.shadowBlur = 0;

  // server racks on each side
  const rack = (x, y, rw, rh, side) => {
    g.fillStyle = '#050b16';
    g.fillRect(x, y, rw, rh);
    g.strokeStyle = 'rgba(90,170,255,0.18)';
    g.strokeRect(x, y, rw, rh);
    // screens
    for (let k = 0; k < 3; k++) {
      const sy0 = y + 40 + k * (rh / 3.4);
      const sw = rw * 0.7;
      const sh = rh / 5;
      const sx0 = x + (rw - sw) / 2;
      g.fillStyle = 'rgba(20,120,200,0.35)';
      g.fillRect(sx0, sy0, sw, sh);
      g.strokeStyle = 'rgba(110,230,255,0.75)';
      g.lineWidth = 3;
      g.beginPath();
      for (let p = 0; p <= 20; p++) {
        const px = sx0 + (p / 20) * sw;
        const py = sy0 + sh * (0.6 - 0.3 * Math.sin(p * 0.9 + k + side) * Math.random());
        if (p) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
      g.stroke();
    }
    // status LEDs
    for (let k = 0; k < 18; k++) {
      g.fillStyle = Math.random() > 0.8 ? 'rgba(120,255,220,0.9)' : 'rgba(80,170,255,0.8)';
      g.fillRect(x + 12 + (k % 3) * 10, y + rh - 160 + Math.floor(k / 3) * 22, 5, 5);
    }
  };
  rack(30, 140, 220, 560, 0);
  rack(270, 200, 190, 470, 1);
  rack(W - 250, 140, 220, 560, 2);
  rack(W - 460, 200, 190, 470, 3);

  // amber safety stripe on the far wall, a subtle industrial cue
  g.fillStyle = 'rgba(220,170,40,0.25)';
  for (let x = 1200; x < 1480; x += 40) {
    g.beginPath();
    g.moveTo(x, 300);
    g.lineTo(x + 20, 300);
    g.lineTo(x + 40, 320);
    g.lineTo(x + 20, 320);
    g.fill();
  }

  // floor reflection of the horizon glow
  grad = g.createRadialGradient(W / 2, horizon + 40, 10, W / 2, horizon + 40, 900);
  grad.addColorStop(0, 'rgba(60,170,255,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, horizon, W, H - horizon);

  // depth of field: downscale then upscale for a cheap, portable blur
  const small = document.createElement('canvas');
  small.width = Math.max(64, Math.round(w / 6));
  small.height = Math.max(32, Math.round(h / 6));
  const sg = small.getContext('2d');
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(c, 0, 0, small.width, small.height);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const og = out.getContext('2d');
  og.imageSmoothingQuality = 'high';
  og.drawImage(small, 0, 0, w, h);
  return out;
}

const raysVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const raysFragment = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;
  void main() {
    float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float soft = pow(max(across, 0.0), 2.5);
    float along = pow(vUv.y, 1.6);
    float flicker = 0.75 + 0.25 * sin(uTime * 0.35 + uSeed * 7.0);
    float v = soft * along * flicker * 0.09;
    gl_FragColor = vec4(vec3(0.45, 0.8, 1.2) * v, v);
  }
`;

function LightRay({ x, rot, width, seed }) {
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uSeed: { value: seed } }), [seed]);
  useFrame((_, dt) => (uniforms.uTime.value += dt));
  return (
    <mesh position={[x, 2.2, -4]} rotation-z={rot}>
      <planeGeometry args={[width, 12]} />
      <shaderMaterial
        vertexShader={raysVertex}
        fragmentShader={raysFragment}
        ref={bindUniforms(uniforms)}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

function PhotoBackdrop({ quality }) {
  const url = quality === 'high' ? assets.backgroundImage : assets.backgroundImageMobile || assets.backgroundImage;
  const texture = useTexture(url); // suspends, so it loads behind the splash
  texture.colorSpace = THREE.SRGBColorSpace;
  // Dimmed so the bearing stays the focal point and text stays readable.
  return <Backdrop texture={texture} tint="#7f93ad" />;
}

function PaintedBackdrop({ quality }) {
  const texture = useMemo(() => {
    const [w, h] = quality === 'high' ? [2048, 1024] : [1024, 512];
    const t = new THREE.CanvasTexture(paintLab(w, h));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [quality]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <Backdrop texture={texture} tint="#ffffff" />;
}

function Backdrop({ texture, tint }) {
  const meshRef = useRef();
  const { camera, size } = useThree();

  // Cover the whole view at the backdrop's depth, with margin for the
  // desktop/mobile view offset.
  useFrame(() => {
    const dist = camera.position.z - DEPTH;
    const visH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const visW = visH * (size.width / size.height);
    const img = texture.image;
    const aspect = img && img.width ? img.width / img.height : 2;
    const margin = 1.35;
    const wPlane = Math.max(visW, visH * aspect) * margin;
    meshRef.current.scale.set(wPlane, wPlane / aspect, 1);
  });

  return (
    <mesh ref={meshRef} position={[0, 0, DEPTH]} renderOrder={-10}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} color={tint} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export default function LabBackdrop({ quality }) {
  return (
    <group>
      {assets.backgroundImage ? <PhotoBackdrop quality={quality} /> : <PaintedBackdrop quality={quality} />}
      <LightRay x={-2.6} rot={-0.32} width={1.6} seed={0.1} />
      <LightRay x={-0.6} rot={-0.08} width={1.1} seed={0.5} />
      <LightRay x={1.4} rot={0.18} width={1.4} seed={0.8} />
      <LightRay x={3.2} rot={0.36} width={1.8} seed={0.3} />
    </group>
  );
}
