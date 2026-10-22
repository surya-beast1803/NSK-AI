// Everything you are likely to swap lives here. Paths are relative to /public.
// No secrets belong in this file: it ships to the browser. The Convai key and
// character id live in .env and are only read by the server.

export const assets = {
  logo: '/assets/logo/nsk-logo.png',

  // Your bearing model. Leave null to use the built-in procedural bearing.
  // The GLB should face +Z (towards the camera) and name its parts so the
  // right pieces spin (matching is case-insensitive, by prefix):
  //   OuterRing*  -> rotates on tap
  //   Ball*       -> orbits with the cage and spins on its own axis
  //   Cage*       -> orbits with the balls (optional)
  //   InnerRing*  -> stays fixed (anything not matched also stays fixed)
  //   Face*       -> the dark centre disk the eyes sit on (optional)
  bearingModel: null, // e.g. '/assets/models/nsk-bearing.glb'
  bearingModelScale: 1,

  // Optional equirectangular .hdr. Leave null to use the built-in studio
  // light rig, which needs no download and is lighter on phones.
  environmentHdr: null, // e.g. '/assets/env/industrial.hdr'

  // Eye clips, one set per eye. Leave null for the animated placeholder.
  // `open` plays when the eye opens, `close` when it blinks shut.
  // Use short muted MP4 (H.264) or WebM, ideally with a black or
  // transparent background, square, 256-512px.
  eyes: {
    left: { open: null, close: null },
    right: { open: null, close: null },
  },

  // Background photo behind the bearing (a smaller copy is used on phones).
  // Set both to null to use the built-in painted lab instead.
  backgroundImage: '/assets/env/lab-background.jpg',
  backgroundImageMobile: '/assets/env/lab-background-mobile.jpg',
};

export const assistant = {
  name: 'NSK Officers Enclave FY2026',
  greeting:
    "Welcome to NSK Officers Enclave FY2026 – Change & Go Beyond. I am your AI Co-Host for today's session with Nathan-san. How can I assist you?",
  speechLang: 'en-IN',
  suggestions: [
    'What causes bearing noise?',
    'How do I mount a deep groove ball bearing?',
    'What is C3 clearance?',
  ],
};

export const personality = {
  boredAfterSeconds: 12, // no typing, talking or tapping for this long -> bored looks
  headSway: true, // gentle left/right head movement while idle
};

export const splash = {
  minDurationMs: 3200, // increased by +1s for longer logo presence
  maxWaitMs: 9000, // after this, continue with whatever has loaded
};

export const bearingLayout = {
  // Where the eyes, smile and voice bars sit on the face, in face-radius units.
  eyeOffsetX: 0.44,
  eyeOffsetY: 0.2,
  eyeSize: 0.34,
  waveformY: -0.36, // the smile and the voice bars share this spot
  waveformWidth: 0.85,
  mouthWidth: 1.0,
};

