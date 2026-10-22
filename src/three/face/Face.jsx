import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { assets, bearingLayout } from '../../config/appConfig.js';
import { voiceSignal } from '../../conversation/voiceSignal.js';
import Eye from './Eye.jsx';
import Waveform from './Waveform.jsx';
import Mouth from './Mouth.jsx';

// Eyes and mouth on the bearing's face. Expressions come from the mood
// controller (useMood.js); this only places and lights them.
export default function Face({ status, faceRadius, mood }) {
  const glow = useRef(1);
  const L = bearingLayout;
  const R = faceRadius;
  // the plane is larger than the eye so the eye can slide around inside it
  const eyePlane = L.eyeSize * R * 2 * 1.6;

  useFrame((_, dt) => {
    const target = status === 'listening' ? 1.25 : 1;
    glow.current += (target - glow.current) * Math.min(1, dt * 6);
  });

  const left = () => mood.current.left;
  const right = () => mood.current.right;
  const blinkCount = () => mood.current.blink.count;
  const mouth = () => mood.current.mouth;
  const barsMix = () => mood.current.mouth.bars;
  const moodName = () => mood.current.mood;

  return (
    <group>
      <group position={[0, L.eyeOffsetY * R, 0]}>
        <group position={[-L.eyeOffsetX * R, 0, 0]}>
          <Eye clips={assets.eyes.left} size={eyePlane} params={left} mirror={-1} blinkCount={blinkCount} glow={glow} />
        </group>
        <group position={[L.eyeOffsetX * R, 0, 0]}>
          <Eye clips={assets.eyes.right} size={eyePlane} params={right} mirror={1} blinkCount={blinkCount} glow={glow} />
        </group>
      </group>
      <group position={[0, L.waveformY * R, 0]}>
        <Mouth width={L.mouthWidth * R} height={0.5 * R} params={mouth} />
        <Waveform width={L.waveformWidth * R} height={0.42 * R} mix={barsMix} mood={moodName} />
      </group>
    </group>
  );
}
