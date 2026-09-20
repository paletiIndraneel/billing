import SEO from '../../components/seo/SEO';
import { Hero } from '../../components/marketing/Sections';
import { SEO_META, BLOG_TOPICS } from '../../data/publicPages';

export default function Blog() {
  const meta = SEO_META.blog;

  return (
    <>
      <SEO path={meta.path} title={meta.title} description={meta.description} />

      <Hero
        title="NEXAURA Blog"
        description="Guides on GST billing, inventory management and running a small business in India."
      />

      <section className="public-section">
        <div className="public-container">
          <h2>Coming soon</h2>
          <p className="public-section-description">
            We&rsquo;re working on articles covering practical topics for Indian small businesses.
            Here&rsquo;s what&rsquo;s planned:
          </p>
          <ul className="public-list">
            {BLOG_TOPICS.map((topic) => (
              <li key={topic}>{topic}</li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
