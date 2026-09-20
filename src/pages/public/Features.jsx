import SEO from '../../components/seo/SEO';
import { Hero, CTASection } from '../../components/marketing/Sections';
import FeatureSection from '../../components/marketing/FeatureSection';
import { SEO_META, CORE_FEATURES } from '../../data/publicPages';

export default function Features({ onSignUp }) {
  const meta = SEO_META.features;

  return (
    <>
      <SEO path={meta.path} title={meta.title} description={meta.description} />

      <Hero
        title="NEXAURA Features"
        description="NEXAURA brings essential business operations into one platform — GST billing, inventory, customers, purchases, payments, orders, ledger and reports, all connected."
      />

      <FeatureSection items={CORE_FEATURES} />

      <CTASection
        title="Explore each feature in detail"
        primaryCta={{ label: 'Start Free', onClick: onSignUp }}
        secondaryCta={{ label: 'View Pricing', to: '/pricing/' }}
      />
    </>
  );
}
