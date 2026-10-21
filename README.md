# NSK Bearing AI Assistant

A mobile-first React website where people talk to a Convai voice AI shown as a
3D NSK bearing with blinking eyes and a voice waveform.

Built with Vite, React 19, Three.js and React Three Fiber.

## Run it

```bash
npm install
cp .env.example .env    # then put your Convai key and character id in .env
npm run dev             # http://localhost:5173, Convai proxy included
```

Production:

```bash
npm run build
npm start               # serves dist/ and the Convai proxy on PORT (default 8080)
```

Voice input needs a secure page. On the computer running the server, open
`http://localhost:5173` (not the `Network:` address Vite also prints), and the
browser will ask for the microphone. To test voice from a phone on the same
Wi-Fi, run `npm run dev:https` and open the `https://192.168.x.x:5173` address
it prints; accept the self-signed certificate warning once. Typing works
everywhere.

If the bearing doesn't appear on a weaker GPU, add `?quality=low` to the
address to use the lighter renderer.

## Where things live

| What | File |
| --- | --- |
| Swappable asset paths (model, eye videos, HDRI, background, logo) | `src/config/appConfig.js` |
| Greeting, suggested questions, speech language | `src/config/appConfig.js` (`assistant`) |
| Eye and waveform placement on the face | `src/config/appConfig.js` (`bearingLayout`) |
| Convai key and character id (server only) | `.env` |
| Convai proxy (adds the key, rate limits, friendly errors) | `server/convaiHandler.js` |
| Conversation state machine | `src/conversation/useConversation.js` |
| Voice capture (speech recognition, or WAV recording fallback) | `src/conversation/speechInput.js` |
| AI voice playback and audio analysis for the waveform | `src/conversation/audioEngine.js` |
| Placeholder bearing geometry and materials | `src/three/bearing/` |
| Eyes, blink timing, waveform | `src/three/face/` |
| Lab backdrop, light rays, particles, holographic platform | `src/three/environment/` |
| Lighting, post effects, layout fitting | `src/three/Scene.jsx` |
| Splash, transcript panel / mobile sheet, controls | `src/components/` |

## Replacing assets

**Your bearing model.** Put a `.glb` in `public/assets/models/` and set
`assets.bearingModel` (for example `'/assets/models/nsk-bearing.glb'`). The model
should face +Z (towards the viewer). Name the parts so the right pieces move:

- `OuterRing…` rotates when the centre is tapped
- `Ball…` orbits with the cage and spins on its own axis
- `Cage…` orbits with the balls (optional)
- `InnerRing…` and `Face…` stay fixed; tapping them spins the bearing

Anything unnamed stays fixed. The model is centred and scaled to the
placeholder's size automatically; fine-tune with `assets.bearingModelScale` and
`bearingLayout`. If the file fails to load, the placeholder bearing is shown
instead.

**Eye videos.** Put clips in `public/assets/eyes/` and set
`assets.eyes.left/right.open` and `.close`. With both set, the eye rests on the
last frame of `open` and each blink plays `close` then `open`. With only one,
it loops. Black in the clip renders as transparent, so clips shot on black work;
WebM with alpha also works. Short, square, muted H.264 MP4 at 256 to 512 px
is the safest choice for phones. Without clips, the shader placeholder eyes blink.

**HDRI.** Set `assets.environmentHdr` to an equirectangular `.hdr` in
`public/assets/env/`. Without one, a built-in studio light rig is used (no
download, lighter on phones). A failed load falls back to the rig.

**Background.** The lab photo lives in `public/assets/env/` and is set by
`assets.backgroundImage` (desktop) and `assets.backgroundImageMobile` (phones).
It is dimmed so the bearing stays the focal point; change the tint in
`src/three/environment/LabBackdrop.jsx`. Set both to `null` to use the
painted lab instead. Light rays, particles and the platform render on top.

## Personality

The placeholder face has glowing robot eyes and a smile, driven by a mood
controller (`src/three/face/useMood.js`). Eyes are drawn in
`src/three/face/Eye.jsx`, the smile in `Mouth.jsx` and the voice bars in
`Waveform.jsx`.

- **Idle:** happy eyes and a smile, blinking (the eye closes from the top into a
  flat line) and a gentle left-right head sway.
- **Typing:** eyes widen and look at the text box; the bearing leans towards it
  and gives a small nod with each keystroke.
- **Listening:** curious eyes, a smile and normal blinking (no voice bars).
- **Thinking:** eyes tilt and look up to one side; the mouth goes flat.
- **Speaking:** excited ^ ^ eyes; the smile becomes voice bars that move with
  the AI's voice.
- **Idle for a while** (`personality.boredAfterSeconds`): looks around
  happily, with a big grin back at the user every few seconds.
- **Spun:** very happy ^ ^ eyes and an open smile.

Tune the timing and sway in `personality` in `src/config/appConfig.js`, and
the placement in `bearingLayout`.

## How the pieces fit

- The splash screen stays up while the 3D scene, textures and lighting load,
  for at least `splash.minDurationMs` and at most `splash.maxWaitMs`, then
  fades into the interface. Devices without WebGL get a 2D face with the same
  conversation features.
- Tap to speak uses the browser's speech recognition where available (live
  transcript). Elsewhere it records the mic and sends WAV audio for Convai to
  transcribe. Tapping while the AI talks interrupts it.
- Replies are spoken through Web Audio, and an analyser drives the waveform
  from the real voice. When a reply has no audio, the waveform plays a
  speech-like animation for the length of the text.
- Statuses: Ready, Listening, Thinking, Speaking. Microphone, network, timeout
  and AI service problems each show a plain-language message.
- Phones get lower DPR, fewer particles and no MSAA; desktops get MSAA and
  finer geometry. Frame rate drops lower the DPR further. Contact shadows
  provide ambient occlusion under the bearing.

## Security

The browser never sees the Convai API key: it only calls `/api/convai/chat` on
this server, which adds the key from `.env`. `.env` is git-ignored. If the key
was ever committed or shared, rotate it in the Convai dashboard.
