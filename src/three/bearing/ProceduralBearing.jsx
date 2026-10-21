import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { assets } from '../../config/appConfig.js';
import {
  DIMENSIONS,
  ballPositions,
  createCageGeometry,
  createInnerRingGeometry,
  createOuterRingGeometry,
} from './geometry.js';
import { createBearingMaterials } from './materials.js';

export const FACE_Z = 0.15;

// Placeholder bearing built from code. Replace it by setting
// assets.bearingModel in src/config/appConfig.js.
export default function ProceduralBearing({ spin, onCentreTap, highQuality, children }) {
  const outerRef = useRef();
  const cageRef = useRef();
  const ballRefs = useRef([]);

  const segments = highQuality ? 128 : 72;
  const geo = useMemo(
    () => ({
      outer: createOuterRingGeometry(segments),
      inner: createInnerRingGeometry(segments),
      cage: createCageGeometry(),
      ball: new THREE.SphereGeometry(DIMENSIONS.ballR, highQuality ? 40 : 24, highQuality ? 28 : 16),
      face: new THREE.CircleGeometry(DIMENSIONS.innerBoreR, 64),
      bezel: new THREE.TorusGeometry(DIMENSIONS.innerBoreR - 0.005, 0.018, 8, 96),
    }),
    [segments, highQuality],
  );
  const mats = useMemo(() => createBearingMaterials({ highQuality }), [highQuality]);
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    },
    [geo, mats],
  );

  const logo = useTexture(assets.logo);
  logo.colorSpace = THREE.SRGBColorSpace;
  logo.anisotropy = 4;

  const balls = useMemo(ballPositions, []);

  useFrame(() => {
    const s = spin.current;
    if (outerRef.current) outerRef.current.rotation.z = s.outer;
    if (cageRef.current) cageRef.current.rotation.z = s.cage;
    for (const b of ballRefs.current) if (b) b.rotation.z = s.ball;
  });

  const centreHandlers = {
    onClick: (e) => {
      e.stopPropagation();
      onCentreTap();
    },
    onPointerOver: () => (document.body.style.cursor = 'pointer'),
    onPointerOut: () => (document.body.style.cursor = ''),
  };

  const logoR = (DIMENSIONS.outerBoreR + DIMENSIONS.outerR) / 2;
  const half = DIMENSIONS.width / 2;

  return (
    <group>
      {/* Rotating: outer ring + its printed logo */}
      <group ref={outerRef}>
        <mesh geometry={geo.outer} material={mats.ringSteel} castShadow receiveShadow />
        <mesh position={[0, logoR, half + 0.002]}>
          <planeGeometry args={[0.4, 0.4 / 3]} />
          <meshStandardMaterial
            map={logo}
            transparent
            roughness={0.45}
            metalness={0.1}
            emissive="#ff1020"
            emissiveMap={logo}
            emissiveIntensity={0.25}
            polygonOffset
            polygonOffsetFactor={-2}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Rotating: cage + balls (orbit slower than the outer ring) */}
      <group ref={cageRef}>
        <mesh geometry={geo.cage} material={mats.cageSteel} position={[0, 0, DIMENSIONS.ballR * 0.62]} />
        <mesh geometry={geo.cage} material={mats.cageSteel} position={[0, 0, -DIMENSIONS.ballR * 0.62]} rotation-y={Math.PI} />
        {balls.map((p, i) => (
          <mesh key={i} ref={(el) => (ballRefs.current[i] = el)} geometry={geo.ball} material={mats.ballChrome} position={p} />
        ))}
      </group>

      {/* Stationary: inner ring, face and everything on it */}
      <group>
        <mesh geometry={geo.inner} material={mats.innerSteel} {...centreHandlers} />
        <mesh geometry={geo.bezel} material={mats.bezel} position={[0, 0, FACE_Z + 0.004]} />
        <mesh geometry={geo.face} material={mats.faceGlass} position={[0, 0, FACE_Z]} {...centreHandlers} />
        <group position={[0, 0, FACE_Z + 0.01]}>{children}</group>
      </group>
    </group>
  );
}
