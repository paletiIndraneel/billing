import { Mail } from 'lucide-react';
import SEO from '../../components/seo/SEO';
import { Hero } from '../../components/marketing/Sections';
import { SEO_META, CONTACT_EMAIL, COMPANY_NAME } from '../../data/publicPages';

export default function Contact() {
  const meta = SEO_META.contact;

  return (
    <>
      <SEO path={meta.path} title={meta.title} description={meta.description} />

      <Hero
        title="Contact NEXAURA"
        description={`Have a question about NEXAURA? Reach the team at ${COMPANY_NAME}.`}
      />

      <section className="public-section">
        <div className="public-container">
          <div className="card public-contact-card">
            <Mail size={22} />
            <div>
              <h2>Email us</h2>
              <p className="public-section-description">
                For product questions, support or licensing, write to us and we&rsquo;ll get back to you.
              </p>
              <a className="btn btn-primary" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
