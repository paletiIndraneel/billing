import SEO from '../../components/seo/SEO';
import { Hero, CTASection } from '../../components/marketing/Sections';
import { SEO_META, COMPANY_NAME } from '../../data/publicPages';

export default function About({ onSignUp }) {
  const meta = SEO_META.about;

  return (
    <>
      <SEO path={meta.path} title={meta.title} description={meta.description} />

      <Hero
        title="About NEXAURA"
        description={`NEXAURA is a business management platform developed by ${COMPANY_NAME}.`}
      />

      <section className="public-section">
        <div className="public-container">
          <h2>Our mission</h2>
          <p className="public-section-description">
            Simplify everyday business operations for growing businesses by bringing billing,
            inventory, customers, purchases, payments and reports into one connected platform.
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-container">
          <h2>Built for Indian businesses</h2>
          <p className="public-section-description">
            NEXAURA is designed around how Indian businesses actually bill and operate — from GST
            invoicing with CGST, SGST and IGST, to day-to-day inventory and customer management —
            so business owners can spend less time on paperwork and more time running the business.
          </p>
        </div>
      </section>

      <CTASection
        title="See NEXAURA for yourself"
        primaryCta={{ label: 'Start Free', onClick: onSignUp }}
        secondaryCta={{ label: 'Contact Us', to: '/contact/' }}
      />
    </>
  );
}
