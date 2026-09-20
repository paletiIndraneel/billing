import { Link } from 'react-router-dom';
import SEO from '../../components/seo/SEO';
import { Hero, CTASection } from '../../components/marketing/Sections';
import { SEO_META } from '../../data/publicPages';

export default function Crm({ onSignUp }) {
  const meta = SEO_META.crm;

  return (
    <>
      <SEO path={meta.path} title={meta.title} description={meta.description} />

      <Hero
        title="Simple CRM for Growing Businesses"
        description="Keep customer details, purchase history and outstanding balances in one place, connected to billing and payments."
        primaryCta={{ label: 'Start Free', onClick: onSignUp }}
      />

      <section className="public-section">
        <div className="public-container">
          <h2>Customer records that stay connected</h2>
          <p className="public-section-description">
            NEXAURA&rsquo;s CRM keeps contact information, purchase history, outstanding balances and a
            running account ledger for every customer, built automatically from the invoices and
            payments you record — no separate spreadsheet to keep updated.
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-container">
          <h2>What you can track per customer</h2>
          <ul className="public-list">
            <li>Contact information and business details</li>
            <li>Purchase and invoice history</li>
            <li>Outstanding balances and due amounts</li>
            <li>A full account ledger of invoices and payments</li>
            <li>Recent activity</li>
          </ul>
        </div>
      </section>

      <section className="public-section">
        <div className="public-container">
          <h2>Related features</h2>
          <p className="public-section-description">
            CRM connects with <Link to="/gst-billing/">GST Billing</Link>,{' '}
            <Link to="/payments/">Payments</Link>, <Link to="/features/">Features</Link> and{' '}
            <Link to="/pricing/">Pricing</Link>.
          </p>
        </div>
      </section>

      <CTASection
        title="Start managing customers with NEXAURA"
        primaryCta={{ label: 'Start Free', onClick: onSignUp }}
        secondaryCta={{ label: 'View Pricing', to: '/pricing/' }}
      />
    </>
  );
}
