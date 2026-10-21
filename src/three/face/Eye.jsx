import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { bindUniforms } from '../bindUniforms.js';

const eyeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Glowing robot eye drawn in the shader: a wide domed shape on a dark
// screen. A smile cut, a blink squash and a tilt give it expressions; the
// whole eye slides around to look at things.
const proceduralFragment = /* glsl */ `
  uniform float uBlink;
  uniform float uLid;
  uniform float uRot;
  uniform float uHappy;
  uniform float uScale;
  uniform float uMirror;
  uniform float uGlow;
  uniform vec2 uLook;
  varying vec2 vUv;

  float oval(vec2 e, float n) {
    return pow(pow(abs(e.x), n) + pow(abs(e.y), n), 1.0 / n) - 1.0;
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    vec2 q = p - uLook * vec2(0.42, 0.4);
    q = mat2(cos(uRot), sin(uRot), -sin(uRot), cos(uRot)) * q;

    // blink: the top comes down onto the lower edge, leaving a flat glowing line
    float blink = clamp(max(uBlink, uLid), 0.0, 1.0);
    vec2 rad = vec2(0.6, 0.34) * uScale;
    float ry = rad.y * mix(1.0, 0.13, blink);
    q.y += (rad.y - ry) * 0.55;
    rad.y = ry;
    vec2 e = q / rad;

    // domed top; the shape squares off into a pill as it closes
    float n = mix(2.4, 5.0, blink);
    float dShape = oval(e, n) * min(rad.x, rad.y);
    // smile: a copy of the oval, shifted down, bites the bottom off and
    // leaves a happy arc; at full strength the eye is a ^ crescent
    float happy = uHappy * (1.0 - blink);
    float hy = -mix(2.6, 0.5, happy);
    float dHappy = -oval(vec2(e.x / mix(1.02, 1.25, happy), e.y - hy), 2.4) * min(rad.x, rad.y);
    float d = max(dShape, dHappy);
    // as it closes, hand over to an exact pill shape so the line and its glow
    // stay the eye's width
    float dPill = length(vec2(max(abs(q.x) - (rad.x - ry), 0.0), q.y)) - ry;
    d = mix(d, dPill, smoothstep(0.25, 0.9, blink));

    float aa = fwidth(d) + 0.002;
    float fill = 1.0 - smoothstep(-aa, aa, d);
    float rim = smoothstep(-0.05, 0.0, d) * fill;
    float glow = exp(-max(d, 0.0) * 12.0) * (1.0 - fill) * 0.75;

    vec3 deep = vec3(0.03, 0.35, 1.1);
    vec3 bright = vec3(0.25, 0.85, 1.6);
    vec3 col = mix(deep, bright, smoothstep(-1.0, 0.8, e.y));
    // Subtle focal core / pupil so direction of gaze is immediately crisp and readable
    float pupil = smoothstep(0.52, 0.08, length(e * vec2(0.85, 1.25)));
    col = mix(col, vec3(0.45, 1.15, 1.85), pupil * 0.35);
    col += vec3(0.3, 0.8, 1.3) * rim * 0.6;
    // screen scanlines
    col *= 0.8 + 0.2 * smoothstep(-0.4, 0.4, sin(vUv.y * 260.0));

    vec3 outCol = (col * fill + vec3(0.1, 0.55, 1.5) * glow) * uGlow;
    gl_FragColor = vec4(outCol, clamp(fill + glow, 0.0, 1.0));
  }
`;

function ProceduralEye({ size, params, mirror, glow }) {
  const uniforms = useMemo(
    () => ({
      uBlink: { value: 0 },
      uLid: { value: 0 },
      uRot: { value: 0 },
      uHappy: { value: 0 },
      uScale: { value: 1 },
      uMirror: { value: mirror },
      uGlow: { value: 1 },
      uLook: { value: new THREE.Vector2() },
    }),
    [mirror],
  );
  useFrame(() => {
    const e = params();
    uniforms.uBlink.value = e.blink;
    uniforms.uLid.value = e.lid;
    uniforms.uRot.value = e.rot;
    uniforms.uHappy.value = e.happy;
    uniforms.uScale.value = e.scale;
    uniforms.uLook.value.set(e.lookX, e.lookY);
    uniforms.uGlow.value = glow.current;
  });
  return (
    <mesh>
      <planeGeometry args={[size, size]} />
      <shaderMaterial
        vertexShader={eyeVertex}
        fragmentShader={proceduralFragment}
        ref={bindUniforms(uniforms)}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// Video eye: black in the clip becomes transparent, so clips can be shot on
// black. Clips with real alpha (WebM VP9) also work.
const videoFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uGlow;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    vec3 col = pow(t.rgb, vec3(2.2));
    float lum = max(col.r, max(col.g, col.b));
    float alpha = t.a * smoothstep(0.02, 0.12, lum);
    gl_FragColor = vec4(col * uGlow * 1.4, alpha);
  }
`;

function makeVideo(src) {
  const v = document.createElement('video');
  v.src = src;
  v.muted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';
  return v;
}

function VideoEye({ size, clips, blinkCount, glow }) {
  const { open, close } = clips;
  const videos = useMemo(() => ({ open: open && makeVideo(open), close: close && makeVideo(close) }), [open, close]);
  const textures = useMemo(() => {
    const t = {};
    for (const k of ['open', 'close']) {
      if (!videos[k]) continue;
      t[k] = new THREE.VideoTexture(videos[k]);
      t[k].colorSpace = THREE.NoColorSpace;
    }
    return t;
  }, [videos]);
  const uniforms = useMemo(() => ({ uMap: { value: textures.open || textures.close }, uGlow: { value: 1 } }), [textures]);
  const seenBlink = useRef(0);

  useEffect(() => {
    const only = videos.open || videos.close;
    if (videos.open && videos.close) {
      // Rest on the last frame of "open"; a blink plays close -> open.
      videos.open.addEventListener('loadeddata', () => (videos.open.currentTime = Math.max(0, videos.open.duration - 0.05)), { once: true });
      videos.close.onended = () => {
        uniforms.uMap.value = textures.open;
        videos.open.currentTime = 0;
        videos.open.play().catch(() => {});
      };
    } else if (only) {
      only.loop = true;
      only.play().catch(() => {});
    }
    return () => {
      Object.values(videos).forEach((v) => v && (v.pause(), v.removeAttribute('src'), v.load()));
      Object.values(textures).forEach((t) => t.dispose());
    };
  }, [videos, textures, uniforms]);

  useFrame(() => {
    uniforms.uGlow.value = glow.current;
    if (!(videos.open && videos.close)) return;
    if (blinkCount() !== seenBlink.current) {
      seenBlink.current = blinkCount();
      uniforms.uMap.value = textures.close;
      videos.close.currentTime = 0;
      videos.close.play().catch(() => {});
    }
  });

  return (
    <mesh>
      <planeGeometry args={[size, size]} />
      <shaderMaterial
        vertexShader={eyeVertex}
        fragmentShader={videoFragment}
        ref={bindUniforms(uniforms)}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// One eye. Uses the clips from appConfig when given, otherwise the
// animated placeholder.
export default function Eye({ clips, ...props }) {
  const hasVideo = clips && (clips.open || clips.close);
  return hasVideo ? <VideoEye clips={clips} {...props} /> : <ProceduralEye {...props} />;
}
