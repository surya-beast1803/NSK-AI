import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { DIMENSIONS } from './geometry.js';
import { FACE_Z } from './ProceduralBearing.jsx';

const match = (name, prefix) => name.toLowerCase().startsWith(prefix.toLowerCase());

// Loads your own bearing GLB. See the naming convention in appConfig.js.
// The model is centred and scaled to the same size as the placeholder so the
// face, eyes and waveform stay in place.
export default function ModelBearing({ url, scale = 1, spin, onCentreTap, children }) {
  const { scene } = useGLTF(url);
  const { root, fit } = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    clone.position.sub(box.getCenter(new THREE.Vector3()));
    clone.updateMatrixWorld(true);
    return { root: clone, fit: ((DIMENSIONS.outerR * 2) / Math.max(size.x, size.y)) * scale };
  }, [scene, scale]);
  const outerPivot = useRef();
  const cagePivot = useRef();
  const balls = useRef([]);

  useLayoutEffect(() => {
    const outer = [];
    const cage = [];
    balls.current = [];
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
      if (match(o.name, 'OuterRing')) outer.push(o);
      else if (match(o.name, 'Ball')) {
        cage.push(o);
        balls.current.push(o);
      } else if (match(o.name, 'Cage')) cage.push(o);
      else if (match(o.name, 'InnerRing') || match(o.name, 'Face')) {
        o.userData.centre = true;
      }
    });
    // Re-parent spinning parts under pivots at the bearing axis, keeping
    // their world transforms.
    outer.forEach((o) => outerPivot.current.attach(o));
    cage.forEach((o) => cagePivot.current.attach(o));
  }, [root]);

  useFrame(() => {
    const s = spin.current;
    outerPivot.current.rotation.z = s.outer;
    cagePivot.current.rotation.z = s.cage;
    for (const b of balls.current) b.rotation.z = s.ball;
  });

  return (
    <group>
      <group scale={fit}>
        <primitive
          object={root}
          onClick={(e) => {
            let o = e.object;
            while (o && !o.userData.centre) o = o.parent;
            if (o) {
              e.stopPropagation();
              onCentreTap();
            }
          }}
        />
        <group ref={outerPivot} />
        <group ref={cagePivot} />
      </group>
      <group position={[0, 0, FACE_Z + 0.01]}>{children}</group>
    </group>
  );
}
