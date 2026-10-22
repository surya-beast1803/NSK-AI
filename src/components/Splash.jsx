import { useEffect, useState } from 'react';
import { assets, splash } from '../config/appConfig.js';

// Black cinematic intro. Stays until the scene reports ready (and the reveal
// has had time to play), or until maxWaitMs so a slow asset never blocks.
export default function Splash({ ready, onLeave, onDone }) {
  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const a = setTimeout(() => setMinElapsed(true), splash.minDurationMs);
    const b = setTimeout(() => setTimedOut(true), splash.maxWaitMs);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  useEffect(() => {
    if ((ready && minElapsed) || timedOut) setLeaving(true);
  }, [ready, minElapsed, timedOut]);

  useEffect(() => {
    if (!leaving) return;
    onLeave?.();
    const t = setTimeout(onDone, 450);
    return () => clearTimeout(t);
  }, [leaving, onLeave, onDone]);

  return (
    <div className={`splash ${leaving ? 'splash--leaving' : ''}`} role="status" aria-live="polite">
      <div className="splash__glow" />
      <div className="splash__logo-wrap">
        <img className="splash__logo" src={assets.logo} alt="NSK" width="1024" height="341" />
        <div className="splash__sheen" />
      </div>
      <p className="splash__tag">NSK Co-Host AI</p>
      <div className="splash__progress" aria-hidden="true">
        <span className={ready ? 'is-ready' : ''} />
      </div>
      <span className="sr-only">{ready ? 'Ready' : 'Loading the assistant'}</span>
    </div>
  );
}
