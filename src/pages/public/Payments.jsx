import { Link } from 'react-router-dom';
import SEO from '../../components/seo/SEO';
import { Hero, CTASection } from '../../components/marketing/Sections';
import { SEO_META } from '../../data/publicPages';

export default function Payments({ onSignUp }) {
  const meta = SEO_META.payments;

  return (
    <>
      <SEO path={meta.path} title={meta.title} description={meta.description} />

      <Hero
        title="Track Business Payments and Expenses in One Place"
        description="Record customer payments, track outstanding invoices, log supplier payments and expenses, and see it all reflected in your reports."
        primaryCta={{ label: 'Start Free', onClick: onSignUp }}
      />

      <section className="public-section">
        <div className="public-container">
          <h2>What NEXAURA tracks</h2>
          <ul className="public-list">
            <li>Customer payments against invoices, including partial payments</li>
            <li>Outstanding invoice balances</li>
            <li>Supplier payments against purchases</li>
            <li>Day-to-day business expenses</li>
            <li>Reports that summarize payments and expenses over time</li>
          </ul>
        </div>
      </section>

      <section className="public-section">
        <div className="public-container">
          <h2>Payment tracking, not payment processing</h2>
          <p className="public-section-description">
            NEXAURA records and tracks payments and expenses you enter — it is not a payment gateway
            and does not process card, UPI or bank transactions on your behalf.
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-container">
          <h2>Related features</h2>
          <p className="public-section-description">
            Payments works alongside <Link to="/crm/">CRM</Link>,{' '}
            <Link to="/gst-billing/">GST Billing</Link> and <Link to="/features/">Features</Link>.
          </p>
        </div>
      </section>

      <CTASection
        title="Start tracking payments and expenses"
        primaryCta={{ label: 'Start Free', onClick: onSignUp }}
        secondaryCta={{ label: 'View Pricing', to: '/pricing/' }}
      />
    </>
  );
}
