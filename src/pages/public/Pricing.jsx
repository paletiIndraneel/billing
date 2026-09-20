import SEO from '../../components/seo/SEO';
import { Hero, CTASection } from '../../components/marketing/Sections';
import { SEO_META, CONTACT_EMAIL } from '../../data/publicPages';

export default function Pricing({ onSignUp }) {
  const meta = SEO_META.pricing;

  return (
    <>
      <SEO path={meta.path} title={meta.title} description={meta.description} />

      <Hero
        title="Simple Pricing for Growing Businesses"
        description="Pricing coming soon. Start a 14-day free trial today, or contact us for details."
        primaryCta={{ label: 'Start Free', onClick: onSignUp }}
      />

      <section className="public-section">
        <div className="public-container public-pricing-notice">
          <div className="card">
            <h2>Pricing coming soon</h2>
            <p className="public-section-description">
              We&rsquo;re finalizing NEXAURA&rsquo;s pricing plans. In the meantime, start a 14-day free
              trial to explore GST billing, inventory, CRM and reports, or contact us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> for details.
            </p>
          </div>
        </div>
      </section>

      <CTASection
        title="Start your free trial"
        primaryCta={{ label: 'Start Free', onClick: onSignUp }}
        secondaryCta={{ label: 'Contact Us', to: '/contact/' }}
      />
    </>
  );
}
