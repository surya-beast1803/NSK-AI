import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { assets, assistant } from './config/appConfig.js';
import { useConversation } from './conversation/useConversation.js';
import { noteActivity } from './conversation/attention.js';
import { useMediaQuery } from './hooks/useMediaQuery.js';
import Splash from './components/Splash.jsx';
import StatusBadge from './components/StatusBadge.jsx';
import ConversationPanel from './components/ConversationPanel.jsx';
import StaticFace from './components/StaticFace.jsx';
import TermsOverlay from './components/TermsOverlay.jsx';

const Scene = lazy(() => import('./three/Scene.jsx'));

class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.warn('[scene] 3D unavailable, showing 2D face:', err?.message || err);
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

export default function App() {
  const convo = useConversation();
  // Side panel on wide screens and on phones held sideways.
  const desktop = useMediaQuery('(min-width: 1024px), (orientation: landscape) and (max-height: 520px) and (min-width: 600px)');
  const coarse = useMediaQuery('(pointer: coarse)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  // ?quality=low forces the lighter renderer (useful on weak GPUs).
  const forced = new URLSearchParams(window.location.search).get('quality');
  const quality = forced === 'low' || forced === 'high' ? forced : desktop && !coarse ? 'high' : 'low';

  const [has3D, setHas3D] = useState(webglAvailable);
  const [sceneReady, setSceneReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(() => {
    try {
      return sessionStorage.getItem('nsk_terms_accepted') === 'true';
    } catch {
      return false;
    }
  });
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Free screen area for the bearing, read by the 3D rig every frame.
  const insets = useRef({ top: 0, right: 0, bottom: 0, left: 0 });
  const headerRef = useRef(null);
  const panelRef = useRef(null);

  useLayoutEffect(() => {
    const measure = () => {
      const header = headerRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      insets.current = {
        top: header ? header.bottom : 0,
        left: 0,
        right: desktop && panel ? window.innerWidth - panel.left : 0,
        bottom: !desktop && panel ? window.innerHeight - panel.top : 0,
      };
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (headerRef.current) ro.observe(headerRef.current);
    if (panelRef.current) ro.observe(panelRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [desktop]);

  const onSceneFail = useCallback(() => {
    setHas3D(false);
    setSceneReady(true);
  }, []);
  const onReady = useCallback(() => setSceneReady(true), []);
  const onSplashDone = useCallback(() => {
    setSplashDone(true);
    noteActivity(); // the boredom clock starts once the user can see the bearing
  }, []);
  const onSplashLeave = useCallback(() => setRevealed(true), []);
  const onAcceptTerms = useCallback(() => {
    try {
      sessionStorage.setItem('nsk_terms_accepted', 'true');
    } catch {
      // ignore
    }
    setTermsAccepted(true);
    setShowTermsModal(false);
    noteActivity();
  }, []);

  useEffect(() => {
    if (!has3D) setSceneReady(true);
  }, [has3D]);

  return (
    <div className={`app ${desktop ? 'app--desktop' : 'app--mobile'} ${revealed ? 'app--live' : ''}`} onPointerDown={noteActivity}>
      <main className="stage" aria-label="NSK AI assistant">
        {has3D ? (
          <SceneBoundary onFail={onSceneFail}>
            <Suspense fallback={null}>
              <Scene status={convo.status} quality={quality} layout={desktop ? 'side' : 'bottom'} insets={insets} reducedMotion={reducedMotion} onReady={onReady} onContextLost={onSceneFail} />
            </Suspense>
          </SceneBoundary>
        ) : (
          <StaticFace status={convo.status} insets={insets} />
        )}
      </main>

      <header className="topbar" ref={headerRef}>
        <div className="brand">
          <img src={assets.logo} alt="NSK" width="72" height="24" />
          <span className="brand__name">{assistant.name.replace(/^NSK\s*/, '')}</span>
        </div>
        <div className="topbar__actions">
          <button
            type="button"
            className="legal-btn"
            onClick={() => setShowTermsModal(true)}
            title="Legal & Educational Disclaimer"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Disclaimer</span>
          </button>
          {!desktop && <StatusBadge status={convo.status} onStop={convo.interrupt} />}
        </div>
      </header>

      <ConversationPanel ref={panelRef} convo={convo} desktop={desktop} />

      {!splashDone && <Splash ready={sceneReady} onLeave={onSplashLeave} onDone={onSplashDone} />}

      <TermsOverlay
        isOpen={(!termsAccepted && splashDone) || showTermsModal}
        isGatekeeper={!termsAccepted}
        onAccept={onAcceptTerms}
        onClose={() => setShowTermsModal(false)}
      />
    </div>
  );
}
