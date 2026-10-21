// React Three Fiber copies a `uniforms` prop into the material, so writing to
// our own uniform objects later would never reach the GPU. Binding through a
// ref makes the material use our objects directly, so per-frame updates
// (time, blink, voice levels) take effect.
export function bindUniforms(uniforms) {
  return (material) => {
    if (material && material.uniforms !== uniforms) {
      material.uniforms = uniforms;
      material.uniformsNeedUpdate = true;
    }
  };
}
