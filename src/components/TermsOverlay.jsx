import { useEffect } from 'react';

export default function TermsOverlay({ isOpen, isGatekeeper, onAccept, onClose }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isGatekeeper) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isGatekeeper, onClose]);

  if (!isOpen) return null;

  return (
    <div className={`terms-overlay ${isGatekeeper ? 'terms-overlay--gatekeeper' : ''}`} role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <div className="terms-overlay__backdrop" onClick={!isGatekeeper ? onClose : undefined} />
      
      <div className="terms-card">
        <div className="terms-card__header">
          <div>
            <h2 id="terms-title" className="terms-card__title">Terms of Use</h2>
            <p className="terms-card__subtitle">Please read carefully before proceeding</p>
          </div>
          {!isGatekeeper && (
            <button type="button" className="terms-card__close" onClick={onClose} aria-label="Close Terms">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

        <div className="terms-card__callout">
          <p>
            Developed by <strong>Quexi Technologies</strong> for <strong>NSK Bearings India Private Limited</strong>. Content is for educational and event use only. NSK India and Quexi Technologies disclaim all liability for practical application.
          </p>
        </div>

        <div className="terms-card__content">
          <section className="terms-card__section">
            <h3>EDUCATIONAL INTENT</h3>
            <p>
              This system is part of the NSK Bearings India Private Limited Skill Development Program. It is designed for vocational training and study purposes only.
            </p>
          </section>

          <section className="terms-card__section">
            <h3>NO INDUSTRIAL LIABILITY</h3>
            <p>
              Information provided regarding bearing maintenance, technical specifications, or industrial safety must NOT be used as a substitute for official NSK India SOPs, OEM manuals, or certified human supervision.
            </p>
          </section>

          <section className="terms-card__section">
            <h3>SAFETY PRIORITY</h3>
            <p>
              In any live industrial environment, site-specific safety rules and supervisor instructions take absolute precedence over this AI&apos;s guidance.
            </p>
          </section>

          <section className="terms-card__section">
            <h3>AI IDENTITY DISCLOSURE</h3>
            <p>
              In compliance with the Information Technology Amendment Rules 2026, you are interacting with Synthetically Generated Information (SGI). This is an AI voice, not a human representative of NSK India.
            </p>
          </section>
        </div>

        <div className="terms-card__footer">
          <p className="terms-card__copyright">
            &copy; 2026 NSK Bearings India Pvt. Ltd. &middot; Powered by Quexi Technologies
          </p>
          {isGatekeeper ? (
            <button type="button" className="terms-card__accept-btn" onClick={onAccept}>
              <span>Accept &amp; Proceed</span>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <button type="button" className="terms-card__dismiss-btn" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
