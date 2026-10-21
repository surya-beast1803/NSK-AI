import { useCallback, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DIMENSIONS } from './geometry.js';

// Kinematics of a deep-groove ball bearing with the inner ring held still:
// the cage (and ball set) orbits at a fraction of the outer ring speed and
// each ball spins about its own axis.
const D = DIMENSIONS.ballR * 2;
const dm = DIMENSIONS.pitchR * 2;
export const CAGE_RATIO = 0.5 * (1 + D / dm);
export const BALL_SPIN_RATIO = -(dm / (2 * D)) * (1 - (D / dm) ** 2);

const KICK = 7; // rad/s added per tap
const MAX_SPEED = 16;

export function useBearingSpin() {
  const state = useRef({ velocity: 0, outer: 0, cage: 0, ball: 0 });

  const kick = useCallback(() => {
    const s = state.current;
    s.velocity = Math.min(MAX_SPEED, s.velocity + KICK);
  }, []);

  useFrame((_, rawDt) => {
    const s = state.current;
    if (s.velocity <= 0) return;
    const dt = Math.min(rawDt, 1 / 20);
    // Rolling friction (constant) plus viscous drag from grease (speed-proportional).
    s.velocity = Math.max(0, s.velocity - (0.45 + 0.09 * s.velocity) * dt);
    const dTheta = s.velocity * dt;
    s.outer -= dTheta; // clockwise as seen by the user
    s.cage -= dTheta * CAGE_RATIO;
    s.ball -= dTheta * BALL_SPIN_RATIO;
  });

  return { spin: state, kick };
}
