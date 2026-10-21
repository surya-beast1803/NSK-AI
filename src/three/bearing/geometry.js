// Procedural deep-groove ball bearing parts. All parts share the Z axis
// (pointing at the camera) so the bearing faces the viewer.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const DIMENSIONS = {
  outerR: 1.6,
  outerBoreR: 1.39,
  innerR: 1.01,
  innerBoreR: 0.84,
  width: 0.46,
  pitchR: 1.2,
  ballR: 0.185,
  ballCount: 10,
  chamfer: 0.03,
};

// Profile point helpers: x = radius, y = axial position (becomes z).
function arc(cx, cy, r, from, to, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}

function lathe(points, segments) {
  const g = new THREE.LatheGeometry(points, segments);
  g.rotateX(Math.PI / 2); // lathe axis Y -> Z
  // Flat-ish shading across the profile corners, then weld the normals at
  // the lathe seam so no vertical line shows where the ring closes.
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const P = points.length;
  const v = new THREE.Vector3();
  for (let j = 0; j < P; j++) {
    const a = j;
    const b = segments * P + j;
    v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z);
    n.setXYZ(b, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
  return g;
}

// Ring with a ball groove on one cylindrical face.
function ringProfile({ rIn, rOut, grooveOnInside, width, chamfer, ballR, pitchR }) {
  const h = width / 2;
  const c = chamfer;
  const grooveR = ballR * 1.04;
  const pts = [];
  // Walk the closed profile counter-clockwise starting at the bore, back face.
  pts.push(new THREE.Vector2(rIn + c, -h));
  pts.push(new THREE.Vector2(rOut - c, -h));
  pts.push(new THREE.Vector2(rOut, -h + c));
  if (!grooveOnInside) {
    // inner ring: groove on the outside diameter
    const depth = Math.sqrt(Math.max(0, grooveR ** 2 - (pitchR - rOut) ** 2));
    pts.push(new THREE.Vector2(rOut, -depth));
    const a0 = Math.atan2(-depth, rOut - pitchR);
    const a1 = Math.atan2(depth, rOut - pitchR);
    // arc bulging towards the axis
    const groove = arc(pitchR, 0, grooveR, a0 + Math.PI * 2 * (a0 < 0 ? 1 : 0), a1, 18);
    groove.forEach((p) => pts.push(p));
    pts.push(new THREE.Vector2(rOut, depth));
  }
  pts.push(new THREE.Vector2(rOut, h - c));
  pts.push(new THREE.Vector2(rOut - c, h));
  pts.push(new THREE.Vector2(rIn + c, h));
  pts.push(new THREE.Vector2(rIn, h - c));
  if (grooveOnInside) {
    const depth = Math.sqrt(Math.max(0, grooveR ** 2 - (rIn - pitchR) ** 2));
    pts.push(new THREE.Vector2(rIn, depth));
    const a0 = Math.atan2(depth, rIn - pitchR);
    const a1 = Math.atan2(-depth, rIn - pitchR);
    arc(pitchR, 0, grooveR, a0, a1, 18).forEach((p) => pts.push(p));
    pts.push(new THREE.Vector2(rIn, -depth));
  }
  pts.push(new THREE.Vector2(rIn, -h + c));
  pts.push(pts[0].clone());
  return pts;
}

export function createOuterRingGeometry(segments = 96) {
  const d = DIMENSIONS;
  return lathe(
    ringProfile({
      rIn: d.outerBoreR,
      rOut: d.outerR,
      grooveOnInside: true,
      width: d.width,
      chamfer: d.chamfer,
      ballR: d.ballR,
      pitchR: d.pitchR,
    }),
    segments,
  );
}

export function createInnerRingGeometry(segments = 96) {
  const d = DIMENSIONS;
  return lathe(
    ringProfile({
      rIn: d.innerBoreR,
      rOut: d.innerR,
      grooveOnInside: false,
      width: d.width,
      chamfer: d.chamfer,
      ballR: d.ballR,
      pitchR: d.pitchR,
    }),
    segments,
  );
}

// Pressed-steel cage half: a collar hugging each ball, joined by riveted
// bridges. Built as one merged geometry so it is a single draw call.
export function createCageGeometry() {
  const d = DIMENSIONS;
  const parts = [];
  const collarR = d.ballR * 0.9;
  const step = (Math.PI * 2) / d.ballCount;
  const chord = 2 * d.pitchR * Math.sin(step / 2);
  const bridgeLen = chord - collarR * 2 + 0.02;
  for (let i = 0; i < d.ballCount; i++) {
    const a = i * step + Math.PI / 2;
    const collar = new THREE.TorusGeometry(collarR, 0.026, 8, 32);
    collar.scale(1, 1, 0.6);
    collar.translate(Math.cos(a) * d.pitchR, Math.sin(a) * d.pitchR, 0);
    parts.push(collar);

    const mid = a + step / 2;
    const bridge = new THREE.BoxGeometry(bridgeLen, 0.075, 0.022);
    bridge.rotateZ(mid + Math.PI / 2);
    bridge.translate(Math.cos(mid) * d.pitchR * Math.cos(step / 2), Math.sin(mid) * d.pitchR * Math.cos(step / 2), -0.01);
    parts.push(bridge);

    const rivet = new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    rivet.rotateX(Math.PI / 2);
    rivet.translate(Math.cos(mid) * d.pitchR * Math.cos(step / 2), Math.sin(mid) * d.pitchR * Math.cos(step / 2), 0.002);
    parts.push(rivet);
  }
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  parts.forEach((g) => g.dispose());
  return merged;
}

export function ballPositions() {
  const d = DIMENSIONS;
  return Array.from({ length: d.ballCount }, (_, i) => {
    const a = (i / d.ballCount) * Math.PI * 2 + Math.PI / 2;
    return [Math.cos(a) * d.pitchR, Math.sin(a) * d.pitchR, 0];
  });
}
