import { Link } from 'react-router-dom';
import SEO from '../../components/seo/SEO';
import { Hero, CTASection, FAQSection } from '../../components/marketing/Sections';
import FeatureSection from '../../components/marketing/FeatureSection';
import { SEO_META, GST_BILLING_FEATURES, GST_BILLING_FAQS } from '../../data/publicPages';

export default function GstBilling({ onSignUp }) {
  const meta = SEO_META.gstBilling;

  return (
    <>
      <SEO path={meta.path} title={meta.title} description={meta.description} />

      <Hero
        title="GST Billing Software for Indian Businesses"
        description="Create GST invoices with CGST, SGST and IGST, track payments and keep a complete, searchable invoice history."
        primaryCta={{ label: 'Start Free', onClick: onSignUp }}
      />

      <section className="public-section">
        <div className="public-container">
          <h2>Manual GST invoicing slows billing down</h2>
          <p className="public-section-description">
            Calculating CGST, SGST and IGST by hand, tracking which invoices are paid, and keeping a
            record of GST rates per product all take time when done in spreadsheets. NEXAURA handles
            invoice numbering, GST calculation and payment tracking together, so billing stays fast and
            consistent.
          </p>
        </div>
      </section>

      <FeatureSection title="Key features" items={GST_BILLING_FEATURES} />

      <section className="public-section">
        <div className="public-container">
          <h2>Who it&rsquo;s for</h2>
          <p className="public-section-description">
            Retailers, wholesalers, service businesses and traders who need to raise GST-compliant
            invoices and keep track of what customers owe.
          </p>
        </div>
      </section>

      <FAQSection faqs={GST_BILLING_FAQS} />

      <section className="public-section">
        <div className="public-container">
          <h2>Related features</h2>
          <p className="public-section-description">
            GST billing works alongside <Link to="/inventory-management/">Inventory</Link>,{' '}
            <Link to="/crm/">CRM</Link> and <Link to="/payments/">Payments</Link> to keep stock,
            customers and money in sync.
          </p>
        </div>
      </section>

      <CTASection
        title="Start creating GST invoices"
        primaryCta={{ label: 'Start Free', onClick: onSignUp }}
        secondaryCta={{ label: 'View Pricing', to: '/pricing/' }}
      />
    </>
  );
}
