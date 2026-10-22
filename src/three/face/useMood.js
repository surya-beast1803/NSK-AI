import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { attention } from '../../conversation/attention.js';
import { voiceSignal } from '../../conversation/voiceSignal.js';
import { personality } from '../../config/appConfig.js';

// The bearing's personality. Every frame this picks a mood from what the user
// and the AI are doing, then eases the eye shapes and head pose towards it.
//
// Eye parameters (per eye):
//   blink    0..1  the top comes down for a blink, closing to a flat line
//   lid      0..1  how far the eye rests closed (squinting when thinking / drowsy)
//   rot            tilt of the eye in radians (curious, thinking)
//   happy    0..1  bottom cut: 0 rounded, 0.5 smiling, 1 a ^ crescent
//   scale          overall size (attentive eyes get bigger)
//   lookX/Y        where the eye looks (the whole eye slides)
// Mouth: smile (curve of the line, 0 flat), open (0..1 open grin),
// bars (0..1 voice bars instead of the line, only while the AI speaks),
// thinking (0..1 cybernetic loading pulse while the AI is thinking).
// Head: yaw, pitch, roll (radians) and bob (world units).

const BORED_AFTER = personality.boredAfterSeconds;
const TYPING_WINDOW = 1.6; // seconds after the last keystroke that still count as typing

const rand = (a, b) => a + Math.random() * (b - a);
// Previews (DEV only) snap straight to the forced mood.
const snap = () => import.meta.env.DEV && typeof window !== 'undefined' && window.__forceMood;
const ease = (cur, target, rate, dt) => (snap() ? target : cur + (target - cur) * Math.min(1, rate * dt));

// Every mood has tailored parameters.
const MOODS = {
  neutral: { happy: 0.5, scale: 1, smile: 0.7, open: 0, thinking: 0, lid: 0 },
  attentive: { happy: 0.45, scale: 1.08, smile: 0.7, open: 0, thinking: 0, lid: 0 },
  listening: { happy: 0.52, scale: 1.07, raise: 0.08, smile: 0.7, open: 0, thinking: 0, lid: 0 },
  thinking: { happy: 0.35, scale: 0.98, rot: -0.28, raise: 0.16, smile: 0, open: 0, bars: 0, thinking: 1, lid: 0.18 },
  speaking: { happy: 0.5, scale: 1, smile: 0.8, open: 0, bars: 1, thinking: 0, lid: 0 },
  bored: { happy: 0.45, scale: 0.98, smile: 0.55, open: 0, thinking: 0, lid: 0.2 },
  grin: { happy: 0.95, scale: 1.05, smile: 1, open: 0.5, thinking: 0, lid: 0 },
  happy: { happy: 1, scale: 1.06, smile: 1, open: 1, thinking: 0, lid: 0 },
};

function makeEye() {
  return { blink: 0, lid: 0, rot: 0, happy: 0, scale: 1, lookX: 0, lookY: 0 };
}

export function useMood({ status, layout, reducedMotion }) {
  const state = useRef({
    left: makeEye(),
    right: makeEye(),
    head: { yaw: 0, pitch: 0, roll: 0, bob: 0 },
    mouth: { smile: 0.7, open: 0, bars: 0, thinking: 0 },
    mood: 'neutral',
    // blink
    blink: { phase: 'idle', t: 0, next: rand(1.5, 3.5), double: false, count: 0 },
    // natural saccadic gaze
    gaze: { x: 0, y: 0.02, timer: 1.5, fixated: true },
    // dynamic thinking gaze sequence
    thinking: { phase: 0, timer: 0, targetX: -0.28, targetY: 0.32 },
    // bored routine
    bored: { side: 1, timer: 0, beat: rand(6, 9), beatT: -1 },
    lastKeyCount: 0,
    keyPulse: 0,
    t: 0,
  });

  useFrame((_, rawDt) => {
    const s = state.current;
    const dt = Math.min(rawDt, 0.05);
    s.t += dt;
    const now = performance.now();
    if (status !== 'idle') attention.lastActivityAt = now;
    const idleFor = (now - attention.lastActivityAt) / 1000;
    const typing = (now - attention.lastKeyAt) / 1000 < TYPING_WINDOW || (attention.inputFocused && idleFor < 4);

    // ----- pick the mood -----
    let mood;
    if (status === 'listening') mood = 'listening';
    else if (status === 'processing') mood = 'thinking';
    else if (status === 'speaking') mood = 'speaking';
    else if ((now - attention.lastSpinAt) / 1000 < 1.8) mood = 'happy'; // enjoys being spun
    else if (typing) mood = 'attentive';
    else if (idleFor > BORED_AFTER) mood = 'bored';
    else mood = 'neutral';
    const urlMood = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('mood') : null;
    if (urlMood && MOODS[urlMood]) mood = urlMood;
    if (import.meta.env.DEV && window.__forceMood) mood = window.__forceMood; // for previews
    if (mood !== 'bored') {
      s.bored.beatT = -1;
      s.bored.beat = rand(5, 8);
    }

    // keystrokes give a small "I'm listening" bounce
    if (attention.keyCount !== s.lastKeyCount) {
      s.lastKeyCount = attention.keyCount;
      s.keyPulse = 1;
    }
    s.keyPulse = Math.max(0, s.keyPulse - dt * 5);

    // ----- gaze & eye tracking -----
    const g = s.gaze;
    let gx = 0;
    let gy = 0;
    let gazeRate = 22; // Snappy, lifelike saccadic speed
    const side = layout === 'side';
    const pointerActive = (now - attention.pointer.movedAt) < 1800 && attention.pointer.active;

    if (mood === 'thinking') {
      // Dynamic thinking choreography: gaze wanders through cognitive search points
      const th = s.thinking;
      th.timer -= dt;
      if (th.timer <= 0) {
        th.phase = (th.phase + 1) % 4;
        if (th.phase === 0) {
          // Look up-left: cognitive search / internal reasoning
          th.targetX = rand(-0.35, -0.22);
          th.targetY = rand(0.28, 0.38);
          th.timer = rand(0.9, 1.4);
        } else if (th.phase === 1) {
          // Look up-right: evaluating possibilities
          th.targetX = rand(0.22, 0.34);
          th.targetY = rand(0.28, 0.38);
          th.timer = rand(0.8, 1.3);
        } else if (th.phase === 2) {
          // Quick downward consideration: synthesizing answer + trigger thoughtful micro-blink
          th.targetX = rand(0.06, 0.18);
          th.targetY = rand(-0.12, 0.04);
          th.timer = rand(0.6, 0.9);
          if (s.blink.phase === 'idle') {
            s.blink.phase = 'closing';
            s.blink.t = 0;
            s.blink.count++;
          }
        } else {
          // Glance back up towards center-left
          th.targetX = rand(-0.18, -0.06);
          th.targetY = rand(0.22, 0.34);
          th.timer = rand(0.7, 1.2);
        }
      }
      // High-speed cognitive micro-tremor while pondering
      const micro = Math.sin(s.t * 22.0) * 0.012 + Math.cos(s.t * 16.0) * 0.008;
      gx = th.targetX + micro;
      gy = th.targetY + Math.abs(micro) * 0.4;
      gazeRate = 24; // Swift saccadic shift between thoughts
    } else if (pointerActive && mood !== 'bored') {
      // User is actively moving cursor/finger: track smoothly with natural constraint
      gx = Math.max(-0.45, Math.min(0.45, attention.pointer.x * 0.52));
      gy = Math.max(-0.32, Math.min(0.36, attention.pointer.y * 0.42));
      gazeRate = 18;
    } else if (mood === 'attentive') {
      // Look at the conversation text box
      gx = side ? 0.42 : 0.05;
      gy = side ? -0.12 : -0.38;
      gazeRate = 20;
    } else if (mood === 'listening') {
      // Direct, engaged eye contact with slight empathetic focus
      gx = Math.sin(s.t * 0.8) * 0.03;
      gy = 0.02 + Math.sin(s.t * 1.2) * 0.025;
      gazeRate = 18;
    } else if (mood === 'bored') {
      const b = s.bored;
      b.timer -= dt;
      if (b.timer <= 0) {
        // Glance to one side, then the other, with the odd look back at user
        b.side = Math.random() < 0.25 ? 0 : -b.side || 1;
        b.timer = rand(1.8, 3.4);
      }
      gx = b.side * 0.48;
      gy = -0.08 + Math.sin(s.t * 0.7) * 0.04;
      gazeRate = 6; // Lazy, relaxed eye movement
      b.beat -= dt;
      if (b.beat <= 0 && b.beatT < 0) b.beatT = 0;
      if (b.beatT >= 0) {
        b.beatT += dt;
        if (b.beatT < 1.4) {
          mood = 'grin';
          gx = 0;
          gy = 0.04;
          gazeRate = 16;
        } else {
          b.beatT = -1;
          b.beat = rand(6, 10);
        }
      }
    } else {
      // Idle / neutral / speaking: direct eye contact with lifelike saccades
      g.timer -= dt;
      if (g.timer <= 0) {
        if (!g.fixated) {
          // Return to friendly direct eye contact
          g.x = 0;
          g.y = 0.02;
          g.fixated = true;
          g.timer = rand(2.2, 4.4);
        } else {
          // Quick natural saccade (glance slightly aside)
          g.x = rand(-0.2, 0.2);
          g.y = rand(-0.1, 0.1);
          g.fixated = false;
          g.timer = rand(0.7, 1.2);
        }
      }
      gx = g.x;
      gy = g.y;
      gazeRate = 22; // Snappy biological saccade
    }
    s.mood = mood;

    // ----- blink -----
    const bl = s.blink;
    bl.t += dt;
    let open = 1;
    if (import.meta.env.DEV && window.__forceBlink != null) bl.phase = 'forced';
    if (bl.phase === 'forced') {
      open = 1 - (window.__forceBlink ?? 0);
      if (window.__forceBlink == null) bl.phase = 'idle';
    } else if (bl.phase === 'idle') {
      if (bl.t >= bl.next) {
        bl.phase = 'closing';
        bl.t = 0;
        bl.count++;
      }
    } else if (bl.phase === 'closing') {
      open = 1 - Math.min(1, bl.t / 0.06);
      if (bl.t >= 0.06) {
        bl.phase = 'opening';
        bl.t = 0;
      }
    } else {
      // Bored eyes open lazily, alert eyes open crisply
      const dur = mood === 'bored' ? 0.32 : 0.14;
      open = Math.min(1, bl.t / dur);
      if (bl.t >= dur) {
        bl.phase = 'idle';
        bl.t = 0;
        if (!bl.double && Math.random() < 0.18) {
          bl.double = true;
          bl.next = 0.12;
        } else {
          bl.double = false;
          bl.next = mood === 'attentive' ? rand(3.5, 6) : mood === 'bored' ? rand(1.8, 3.5) : rand(2.2, 5.5);
        }
      }
    }

    // ----- ease the eyes -----
    const target = MOODS[mood];
    const talk = mood === 'speaking' ? voiceSignal.level : 0;
    for (const [eye, side] of [
      [s.left, -1],
      [s.right, 1],
    ]) {
      eye.lid = ease(eye.lid, target.lid ?? 0, 8, dt);
      eye.rot = ease(eye.rot, target.rot ?? 0, 7, dt);
      eye.happy = ease(eye.happy, target.happy, 7, dt);
      eye.scale = ease(eye.scale, target.scale + s.keyPulse * 0.06, 9, dt);
      eye.lookX = ease(eye.lookX, gx, gazeRate, dt);
      eye.lookY = ease(eye.lookY, gy + (target.raise ?? 0) * side, gazeRate, dt);
      eye.blink = 1 - open; // the top lid sweeps down to blink
    }

    // ----- mouth -----
    const mo = s.mouth;
    mo.smile = ease(mo.smile, target.smile, 7, dt);
    mo.open = ease(mo.open, target.open, 7, dt);
    mo.bars = ease(mo.bars, target.bars ?? 0, 8, dt);
    mo.thinking = ease(mo.thinking ?? 0, target.thinking ?? 0, 9, dt);

    // ----- head pose -----
    const h = s.head;
    const m = !personality.headSway ? 0 : reducedMotion ? 0.3 : 1;
    let yaw = 0;
    let pitch = 0;
    let roll = 0;
    if (mood === 'thinking') {
      yaw = 0.12 + Math.sin(s.t * 1.4) * 0.02;
      pitch = -0.06 + Math.sin(s.t * 1.8) * 0.015;
      roll = 0.08 + Math.sin(s.t * 0.9) * 0.015;
    } else if (pointerActive && mood !== 'bored') {
      yaw = gx * 0.28;
      pitch = gy * 0.22;
      roll = -gx * 0.05;
    } else if (mood === 'attentive') {
      yaw = (side ? 0.16 : 0) + Math.sin(s.t * 1.1) * 0.02;
      pitch = (side ? 0.02 : 0.12) - s.keyPulse * 0.04;
      roll = side ? -0.03 : 0;
    } else if (mood === 'listening') {
      yaw = Math.sin(s.t * 0.9) * 0.04;
      pitch = -0.03;
      roll = 0.06 * Math.sin(s.t * 0.6); // curious head tilt
    } else if (mood === 'speaking') {
      yaw = Math.sin(s.t * 1.4) * 0.05;
      pitch = -talk * 0.05;
      roll = Math.sin(s.t * 0.8) * 0.03;
    } else if (mood === 'grin' || mood === 'happy') {
      yaw = Math.sin(s.t * 6) * 0.05;
      pitch = -0.04;
      roll = Math.sin(s.t * 6 + 1) * 0.06;
    } else if (mood === 'bored') {
      yaw = gx * 0.4;
      pitch = -0.02;
      roll = -gx * 0.1;
    } else {
      yaw = Math.sin(s.t * 0.55) * 0.14 + Math.sin(s.t * 1.3) * 0.03;
      pitch = Math.sin(s.t * 0.4 + 1) * 0.03;
      roll = Math.sin(s.t * 0.55 + 0.6) * 0.045;
    }
    const headRate = mood === 'grin' || mood === 'happy' ? 8 : 4;
    h.yaw = ease(h.yaw, yaw * m, headRate, dt);
    h.pitch = ease(h.pitch, pitch * m, headRate, dt);
    h.roll = ease(h.roll, roll * m, headRate, dt);
    h.bob = Math.sin(s.t * 1.2) * 0.04 * m;
  });

  return state;
}

