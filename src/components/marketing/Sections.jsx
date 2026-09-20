import { Link } from 'react-router-dom';

export function Hero({ eyebrow, title, description, primaryCta, secondaryCta }) {
  return (
    <section className="public-hero auth-screen--aurora">
      <div className="auth-stars" aria-hidden="true" />
      <div className="public-container">
        {eyebrow && <div className="public-eyebrow">{eyebrow}</div>}
        <h1 className="public-hero-title">{title}</h1>
        <p className="public-hero-description">{description}</p>
        {(primaryCta || secondaryCta) && (
          <div className="public-hero-actions">
            {primaryCta && (
              <button type="button" className="btn btn-primary" onClick={primaryCta.onClick}>
                {primaryCta.label}
              </button>
            )}
            {secondaryCta && (
              <button type="button" className="btn btn-secondary" onClick={secondaryCta.onClick}>
                {secondaryCta.label}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function CTASection({ title, description, primaryCta, secondaryCta }) {
  return (
    <section className="public-cta-section">
      <div className="public-container public-cta-inner">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <div className="public-hero-actions">
          {primaryCta && (
            <button type="button" className="btn btn-primary" onClick={primaryCta.onClick}>
              {primaryCta.label}
            </button>
          )}
          {secondaryCta && (
            <Link className="btn btn-secondary" to={secondaryCta.to}>
              {secondaryCta.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

export function FAQSection({ title = 'Frequently asked questions', faqs }) {
  if (!faqs?.length) return null;
  return (
    <section className="public-faq-section">
      <div className="public-container">
        <h2>{title}</h2>
        <div className="public-faq-list">
          {faqs.map(({ q, a }) => (
            <details className="public-faq-item" key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
