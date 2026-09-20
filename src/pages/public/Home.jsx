import SEO from '../../components/seo/SEO';
import { Hero, CTASection } from '../../components/marketing/Sections';
import FeatureSection from '../../components/marketing/FeatureSection';
import ProductCarousel from '../../components/landing/ProductCarousel';
import { SEO_META, CORE_FEATURES, SITE_URL } from '../../data/publicPages';

export default function Home({ onSignIn, onSignUp }) {
  const meta = SEO_META.home;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'NEXAURA',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: meta.description,
    url: SITE_URL,
    provider: { '@type': 'Organization', name: 'KANARA CLOUD SOLUTIONS Pvt. Ltd.' },
  };

  return (
    <>
      <SEO path={meta.path} title={meta.title} description={meta.description} jsonLd={jsonLd} />

      <Hero
        eyebrow="Business Simplified"
        title="Business Management Software for Indian Businesses"
        description="NEXAURA helps you manage GST billing, invoicing, inventory, CRM, purchases, expenses, payments and business reports — all in one connected platform."
        primaryCta={{ label: 'Start Free', onClick: onSignUp }}
        secondaryCta={{ label: 'Sign In', onClick: onSignIn }}
      />

      <section className="public-section">
        <div className="public-container">
          <h2>One platform for everyday business operations</h2>
          <p className="public-section-description">
            Instead of juggling separate tools for billing, stock and customer records, NEXAURA keeps
            GST billing, inventory, CRM, purchases, expenses and reports connected — so a sale updates
            stock, an invoice updates the customer ledger, and your reports stay current automatically.
          </p>
        </div>
      </section>

      <FeatureSection
        title="Core features"
        description="Everything a growing business needs to run billing and operations in one place."
        items={CORE_FEATURES}
      />

      <section className="public-section">
        <div className="public-container">
          <h2>See NEXAURA in action</h2>
          <ProductCarousel />
        </div>
      </section>

      <section className="public-section">
        <div className="public-container">
          <h2>Built for how Indian businesses actually work</h2>
          <p className="public-section-description">
            GST rates, CGST/SGST/IGST invoicing, and day-to-day stock and customer management are built
            into the core of NEXAURA, not bolted on — so billing, inventory and customer records stay
            connected as your business grows.
          </p>
        </div>
      </section>

      <CTASection
        title="Ready to simplify your business operations?"
        description="Start free, and set up GST billing, inventory and CRM in minutes."
        primaryCta={{ label: 'Start Free', onClick: onSignUp }}
        secondaryCta={{ label: 'See Features', to: '/features/' }}
      />
    </>
  );
}
