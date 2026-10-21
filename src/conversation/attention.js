// What the user is doing right now, shared with the 3D face without React
// renders: typing makes the bearing watch the input, cursor moves guide eye gaze,
// silence makes it bored.

export const attention = {
  lastActivityAt: performance.now(),
  lastKeyAt: -Infinity,
  keyCount: 0,
  inputFocused: false,
  lastSpinAt: -Infinity,
  pointer: {
    x: 0,
    y: 0,
    movedAt: 0,
    active: false,
  },
};

export function noteActivity() {
  attention.lastActivityAt = performance.now();
}

export function noteKeystroke() {
  const now = performance.now();
  attention.lastKeyAt = now;
  attention.lastActivityAt = now;
  attention.keyCount++;
}

export function noteSpin() {
  attention.lastSpinAt = performance.now();
  noteActivity();
}

export function noteInputFocus(focused) {
  attention.inputFocused = focused;
  noteActivity();
}

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointermove',
    (e) => {
      // Map screen coords to -1 .. 1 (centered, +Y upwards)
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = -((e.clientY / window.innerHeight) * 2 - 1);
      attention.pointer.x = nx;
      attention.pointer.y = ny;
      attention.pointer.movedAt = performance.now();
      attention.pointer.active = true;
      attention.lastActivityAt = performance.now();
    },
    { passive: true },
  );

  window.addEventListener(
    'pointerleave',
    () => {
      attention.pointer.active = false;
    },
    { passive: true },
  );
}

