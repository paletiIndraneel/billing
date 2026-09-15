import { useEffect, useRef, useState } from 'react';

const SLIDES = [
  {
    src: '/landing/dashboard.png',
    alt: 'NEXAURA dashboard showing sales, outstanding payments and inventory at a glance',
    title: 'See your business at a glance',
    description: 'Track sales, outstanding payments, inventory and customers from one dashboard.',
  },
  {
    src: '/landing/billing.png',
    alt: 'NEXAURA GST billing screen creating an invoice with CGST, SGST and IGST',
    title: 'GST billing made simple',
    description: 'Create professional invoices with GST, discounts, payments and customer details.',
  },
  {
    src: '/landing/inventory.png',
    alt: 'NEXAURA inventory screen listing products with stock levels and reorder status',
    title: 'Know your stock',
    description: 'Manage products, variants, batches, stock levels and purchases.',
  },
  {
    src: '/landing/crm.png',
    alt: 'NEXAURA customer relationship management screen with contacts and ledger balances',
    title: 'Keep customers connected',
    description: 'Manage customers, vendors, ledgers, balances and purchase history.',
  },
  {
    src: '/landing/reports.png',
    alt: 'NEXAURA reports screen with sales, expense and GST analytics charts',
    title: 'Understand your business',
    description: 'Turn sales, expenses, inventory and GST data into useful business reports.',
  },
];

const INTERVAL_MS = 5000;

export default function ProductCarousel() {
  const [index, setIndex] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [index]);

  const goTo = (i) => setIndex(i);

  return (
    <div className="landing-carousel">
      <div className="landing-carousel-frame">
        {SLIDES.map((slide, i) => (
          <img
            key={slide.src}
            src={slide.src}
            alt={slide.alt}
            className={`landing-carousel-slide${i === index ? ' is-active' : ''}`}
            loading={i === 0 ? 'eager' : 'lazy'}
            width={1828}
            height={860}
          />
        ))}
      </div>
      <div className="landing-carousel-caption">
        <h3>{SLIDES[index].title}</h3>
        <p>{SLIDES[index].description}</p>
      </div>
      <div className="landing-carousel-dots" role="tablist" aria-label="Product screenshots">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Show slide ${i + 1} of ${SLIDES.length}: ${slide.title}`}
            className={`landing-carousel-dot${i === index ? ' is-active' : ''}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </div>
  );
}
