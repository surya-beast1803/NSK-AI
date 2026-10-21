import { Component, Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, PerformanceMonitor, Preload } from '@react-three/drei';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { assets } from '../config/appConfig.js';
import ProceduralBearing from './bearing/ProceduralBearing.jsx';
import ModelBearing from './bearing/ModelBearing.jsx';
import { useBearingSpin } from './bearing/useBearingSpin.js';
import { DIMENSIONS } from './bearing/geometry.js';
import Face from './face/Face.jsx';
import { useMood } from './face/useMood.js';
import { noteSpin } from '../conversation/attention.js';
import Particles from './environment/Particles.jsx';
import HoloPlatform from './environment/HoloPlatform.jsx';
import LabBackdrop from './environment/LabBackdrop.jsx';

class Fallback extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.warn(`[scene] ${this.props.label} failed, using fallback:`, err?.message || err);
    this.props.onFail?.(this.props.label);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// Built-in studio rig rendered into a cube map once: works offline, costs
// nothing per frame, and gives the steel its cyan/blue industrial reflections.
function StudioEnvironment() {
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={['#050b16']} />
      <Lightformer form="rect" intensity={3} color="#e8f4ff" position={[0, 5, 2]} rotation-x={Math.PI / 2} scale={[10, 3, 1]} />
      <Lightformer form="rect" intensity={1.6} color="#ffffff" position={[-2, 3, 6]} rotation-x={-0.4} scale={[7, 2.5, 1]} />
      <Lightformer form="rect" intensity={1.1} color="#dcefff" position={[0, 4, 8]} scale={[14, 3, 1]} />
      <Lightformer form="rect" intensity={4} color="#28c8ff" position={[-6, 0.5, -1]} rotation-y={Math.PI / 2} scale={[8, 0.6, 1]} />
      <Lightformer form="rect" intensity={3.5} color="#2a6bff" position={[6, -0.5, -1]} rotation-y={-Math.PI / 2} scale={[8, 0.6, 1]} />
      <Lightformer form="rect" intensity={0.8} color="#9fe6ff" position={[3, -2, 5]} rotation-x={0.4} scale={[5, 1, 1]} />
      <Lightformer form="rect" intensity={0.6} color="#0a2a50" position={[0, -5, 0]} rotation-x={-Math.PI / 2} scale={[10, 10, 1]} />
    </Environment>
  );
}

function SceneEnvironment() {
  if (!assets.environmentHdr) return <StudioEnvironment />;
  return (
    <Fallback label="environment HDRI" fallback={<StudioEnvironment />}>
      <Environment files={assets.environmentHdr} resolution={256} />
    </Fallback>
  );
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.15} color="#5a7fb0" />
      <directionalLight position={[2, 4, 6]} intensity={0.9} color="#eaf4ff" />
      {/* cyan and blue rim lights from behind */}
      <spotLight position={[-5, 3, -4]} angle={0.5} penumbra={1} intensity={60} color="#22d3ff" distance={20} />
      <spotLight position={[5, -1, -4]} angle={0.5} penumbra={1} intensity={45} color="#2f6bff" distance={20} />
    </>
  );
}

// Keeps the bearing centred in the free area (left of the desktop panel,
// above the mobile sheet) and scaled to fit, easing between layouts.
const COMPOSITION = { width: 4.4, height: 4.3, centreY: -0.3 };
const NARROW_WIDTH = 3.7; // phones: let the platform run off the edges

function Rig({ insets, children }) {
  const group = useRef();
  const { camera, size } = useThree();
  const cur = useRef({ x: 0, y: 0, s: 0 });

  useFrame((_, dt) => {
    const { top, right, bottom, left } = insets.current;
    const availW = Math.max(120, size.width - left - right);
    const availH = Math.max(120, size.height - top - bottom);
    const tx = (right - left) / 2;
    const ty = (bottom - top) / 2;
    const visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const pxToWorld = visH / size.height;
    const compW = availW < 600 ? NARROW_WIDTH : COMPOSITION.width;
    const ts = Math.min((availW * pxToWorld) / compW, (availH * pxToWorld) / COMPOSITION.height, 1.3);
    const c = cur.current;
    const k = c.s === 0 ? 1 : Math.min(1, dt * 5);
    c.x += (tx - c.x) * k;
    c.y += (ty - c.y) * k;
    c.s += (ts - c.s) * k;
    camera.setViewOffset(size.width, size.height, c.x, c.y, size.width, size.height);
    group.current.scale.setScalar(c.s);
    group.current.position.y = -COMPOSITION.centreY * c.s;
  });

  return <group ref={group}>{children}</group>;
}

function ReadySignal({ onReady }) {
  const frames = useRef(0);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    if (++frames.current >= 3) {
      done.current = true;
      onReady();
    }
  });
  return null;
}

function BearingAssembly({ status, quality, layout, reducedMotion }) {
  const { spin, kick } = useBearingSpin();
  const mood = useMood({ status, layout, reducedMotion });
  const head = useRef();
  const onTap = () => {
    kick();
    noteSpin();
  };

  // The whole bearing turns and floats like a head; it always comes back
  // to face the user.
  useFrame(() => {
    const h = mood.current.head;
    if (!head.current) return;
    head.current.rotation.set(h.pitch, h.yaw, h.roll);
    head.current.position.y = h.bob;
  });

  const face = <Face status={status} faceRadius={DIMENSIONS.innerBoreR} mood={mood} />;
  const procedural = (
    <ProceduralBearing spin={spin} onCentreTap={onTap} highQuality={quality === 'high'}>
      {face}
    </ProceduralBearing>
  );
  return (
    <group ref={head}>
      {assets.bearingModel ? (
        <Fallback label="bearing model" fallback={procedural}>
          <ModelBearing url={assets.bearingModel} scale={assets.bearingModelScale} spin={spin} onCentreTap={onTap}>
            {face}
          </ModelBearing>
        </Fallback>
      ) : (
        procedural
      )}
    </group>
  );
}

function Effects({ quality }) {
  const high = quality === 'high';
  if (high) {
    return (
      // No MSAA: multisampled float targets render black on some laptop GPUs.
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur luminanceThreshold={0.95} luminanceSmoothing={0.15} intensity={0.85} radius={0.7} />
        <Vignette offset={0.25} darkness={0.65} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    );
  }
  // Phones: skip MSAA; keep bloom, which sells the glow.
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur luminanceThreshold={0.95} luminanceSmoothing={0.15} intensity={0.7} radius={0.65} />
      <Vignette offset={0.25} darkness={0.65} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

export default function Scene({ status, quality, layout, insets, reducedMotion, onReady, onContextLost }) {
  const [dpr, setDpr] = useState(quality === 'high' ? 2 : 1.5);
  useEffect(() => setDpr(quality === 'high' ? 2 : 1.5), [quality]);

  return (
    <Canvas
      className="scene-canvas"
      dpr={[1, dpr]}
      camera={{ position: [0, 0, 9], fov: 32, near: 0.1, far: 50 }}
      gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.NoToneMapping, stencil: false }}
      aria-label="NSK bearing assistant. Tap the centre of the bearing to spin it."
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          onContextLost?.();
        });
      }}
      role="img"
    >
      <color attach="background" args={['#030914']} />
      <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(1, d - 0.25))} />
      <Suspense fallback={null}>
        <SceneEnvironment />
        <Lights />
        <LabBackdrop quality={quality} />
        <Rig insets={insets}>
          <BearingAssembly status={status} quality={quality} layout={layout} reducedMotion={reducedMotion} />
          <HoloPlatform active={status !== 'idle'} />
          <ContactShadows position={[0, -2.03, 0]} scale={4.5} blur={2.4} opacity={0.6} far={2.5} frames={1} resolution={256} color="#000814" />
          <Particles count={quality === 'high' ? 900 : 380} reducedMotion={reducedMotion} />
        </Rig>
        <Effects quality={quality} />
        <Preload all />
        <ReadySignal onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
