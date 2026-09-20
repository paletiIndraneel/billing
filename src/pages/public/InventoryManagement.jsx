import { Link } from 'react-router-dom';
import SEO from '../../components/seo/SEO';
import { Hero, CTASection, FAQSection } from '../../components/marketing/Sections';
import FeatureSection from '../../components/marketing/FeatureSection';
import { SEO_META, INVENTORY_FEATURES, INVENTORY_FAQS } from '../../data/publicPages';

export default function InventoryManagement({ onSignUp }) {
  const meta = SEO_META.inventoryManagement;

  return (
    <>
      <SEO path={meta.path} title={meta.title} description={meta.description} />

      <Hero
        title="Inventory Management Software for Small Businesses"
        description="Track products, stock levels, purchases and reorder levels in one place, connected to billing so stock stays accurate."
        primaryCta={{ label: 'Start Free', onClick: onSignUp }}
      />

      <section className="public-section">
        <div className="public-container">
          <h2>Stock that&rsquo;s out of sync with sales</h2>
          <p className="public-section-description">
            When stock is tracked separately from billing, it drifts out of date fast. NEXAURA links
            inventory directly to billing and purchases, so stock updates as you sell and restock.
          </p>
        </div>
      </section>

      <FeatureSection title="Key features" items={INVENTORY_FEATURES} />

      <section className="public-section">
        <div className="public-container">
          <h2>Who it&rsquo;s for</h2>
          <p className="public-section-description">
            Businesses that hold physical stock — retailers, distributors and wholesalers — who need
            stock levels to stay accurate as they sell and restock.
          </p>
        </div>
      </section>

      <FAQSection faqs={INVENTORY_FAQS} />

      <section className="public-section">
        <div className="public-container">
          <h2>Related features</h2>
          <p className="public-section-description">
            Inventory works alongside <Link to="/gst-billing/">GST Billing</Link>,{' '}
            <Link to="/features/">Features</Link> and <Link to="/pricing/">Pricing</Link>.
          </p>
        </div>
      </section>

      <CTASection
        title="Start tracking your inventory"
        primaryCta={{ label: 'Start Free', onClick: onSignUp }}
        secondaryCta={{ label: 'View Pricing', to: '/pricing/' }}
      />
    </>
  );
}
