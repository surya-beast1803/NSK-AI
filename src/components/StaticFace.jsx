import { useEffect, useRef, useState } from 'react';
import { updateVoiceSignal, voiceSignal } from '../conversation/voiceSignal.js';

// 2D stand-in for devices without WebGL, so the conversation still has a
// face: steel ring, blinking eyes and a live waveform.
export default function StaticFace({ status, insets }) {
  const bars = useRef([]);
  const [style, setStyle] = useState({});

  useEffect(() => {
    let raf;
    const tick = (t) => {
      updateVoiceSignal();
      const { top, right, bottom } = insets.current;
      setStyle((s) => {
        const next = { top: `${top}px`, right: `${right}px`, bottom: `${bottom}px` };
        return s.top === next.top && s.right === next.right && s.bottom === next.bottom ? s : next;
      });
      bars.current.forEach((el, i) => {
        if (!el) return;
        const v =
          status === 'speaking' && voiceSignal.source !== 'none'
            ? voiceSignal.bands[i * 2]
            : status === 'listening'
              ? 0.15 + 0.15 * Math.sin(t / 200 + i)
              : status === 'processing'
                ? 0.28 + 0.22 * Math.sin(t / 140 - i * 0.45)
                : 0.06;
        el.style.transform = `scaleY(${Math.max(0.06, v)})`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, insets]);

  return (
    <div className="static-face" style={style} role="img" aria-label="NSK bearing assistant">
      <div className="static-face__ring">
        <div className="static-face__inner">
          <div className="static-face__eyes">
            <span />
            <span />
          </div>
          <div className="static-face__wave">
            {Array.from({ length: 16 }, (_, i) => (
              <i key={i} ref={(el) => (bars.current[i] = el)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
