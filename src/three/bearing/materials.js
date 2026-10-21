import * as THREE from 'three';

// PBR materials tuned for an environment-lit, polished bearing-steel look.
export function createBearingMaterials({ highQuality }) {
  const ringSteel = new THREE.MeshPhysicalMaterial({
    color: '#cfd5dd',
    metalness: 1,
    roughness: highQuality ? 0.22 : 0.26,
    envMapIntensity: 1.25,
  });

  const innerSteel = ringSteel.clone();
  innerSteel.roughness = 0.2;
  innerSteel.color.set('#c3c9d2');

  const ballChrome = new THREE.MeshPhysicalMaterial({
    color: '#eef1f5',
    metalness: 1,
    roughness: 0.09,
    envMapIntensity: 1.5,
  });

  const cageSteel = new THREE.MeshPhysicalMaterial({
    color: '#8f959e',
    metalness: 1,
    roughness: 0.38,
    envMapIntensity: 1,
  });

  const faceGlass = new THREE.MeshPhysicalMaterial({
    color: '#03070f',
    metalness: 0.2,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 0.3,
  });

  const bezel = new THREE.MeshPhysicalMaterial({
    color: '#3a4250',
    metalness: 1,
    roughness: 0.3,
  });

  return { ringSteel, innerSteel, ballChrome, cageSteel, faceGlass, bezel };
}
