import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';
import {
  DIMENSIONS,
  ballPositions,
  createCageGeometry,
  createInnerRingGeometry,
  createOuterRingGeometry,
} from './src/three/bearing/geometry.js';
import { createBearingMaterials } from './src/three/bearing/materials.js';

class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onloadend) this.onloadend();
    });
  }
}
globalThis.FileReader = FileReader;



const FACE_Z = 0.15;

async function run() {
  const mats = createBearingMaterials({ highQuality: true });

  const root = new THREE.Group();
  root.name = 'NSK_Bearing';

  // Outer Ring
  const outerRing = new THREE.Mesh(createOuterRingGeometry(128), mats.ringSteel);
  outerRing.name = 'OuterRing';
  root.add(outerRing);

  // Cage Front & Back
  const cageFront = new THREE.Mesh(createCageGeometry(), mats.cageSteel);
  cageFront.name = 'Cage_Front';
  cageFront.position.set(0, 0, DIMENSIONS.ballR * 0.62);
  root.add(cageFront);

  const cageBack = new THREE.Mesh(createCageGeometry(), mats.cageSteel);
  cageBack.name = 'Cage_Back';
  cageBack.position.set(0, 0, -DIMENSIONS.ballR * 0.62);
  cageBack.rotation.y = Math.PI;
  root.add(cageBack);

  // Balls
  const ballGeo = new THREE.SphereGeometry(DIMENSIONS.ballR, 32, 24);
  const balls = ballPositions();
  balls.forEach((p, i) => {
    const ball = new THREE.Mesh(ballGeo, mats.ballChrome);
    ball.name = `Ball_${i + 1}`;
    ball.position.set(p[0], p[1], p[2]);
    root.add(ball);
  });

  // Inner Ring
  const innerRing = new THREE.Mesh(createInnerRingGeometry(128), mats.innerSteel);
  innerRing.name = 'InnerRing';
  root.add(innerRing);

  // Face (centre plate)
  const face = new THREE.Mesh(new THREE.CircleGeometry(DIMENSIONS.innerBoreR, 64), mats.faceGlass);
  face.name = 'Face';
  face.position.set(0, 0, FACE_Z);
  root.add(face);

  // Bezel
  const bezel = new THREE.Mesh(
    new THREE.TorusGeometry(DIMENSIONS.innerBoreR - 0.005, 0.018, 8, 96),
    mats.bezel
  );
  bezel.name = 'Face_Bezel';
  bezel.position.set(0, 0, FACE_Z + 0.004);
  root.add(bezel);

  console.log('Scene graph built. Exporting GLB...');

  const exporter = new GLTFExporter();
  exporter.parse(
    root,
    (gltf) => {
      const buffer = Buffer.from(gltf);
      const outDir = path.resolve('public/assets/models');
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      const outPath = path.join(outDir, 'nsk-bearing-reference.glb');
      fs.writeFileSync(outPath, buffer);
      console.log(`Successfully exported GLB (${buffer.length} bytes) to: ${outPath}`);
    },
    (err) => {
      console.error('Export error:', err);
    },
    { binary: true }
  );
}

run().catch(console.error);
