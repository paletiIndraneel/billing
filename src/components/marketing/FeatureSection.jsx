import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

// Reuses the existing .landing-features/.landing-feature-card/.landing-feature-icon
// classes (defined for the homepage's FeatureGrid) so this stays visually consistent
// without duplicating CSS.
export default function FeatureSection({ title, description, items }) {
  return (
    <section className="public-features-section">
      <div className="public-container">
        {title && <h2>{title}</h2>}
        {description && <p className="public-section-description">{description}</p>}
        <div className="landing-features public-features-grid">
          {items.map(({ icon: Icon = CheckCircle2, title: itemTitle, description: itemDescription, href }) => {
            const card = (
              <>
                <div className="landing-feature-icon">
                  <Icon size={18} />
                </div>
                <div>
                  <h3>{itemTitle}</h3>
                  <p>{itemDescription}</p>
                </div>
              </>
            );
            return href ? (
              <Link className="landing-feature-card public-feature-card--link" to={href} key={itemTitle}>
                {card}
              </Link>
            ) : (
              <div className="landing-feature-card" key={itemTitle}>
                {card}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
