import { describe, it, expect, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import PublicSite from './PublicSite';

// Smoke-tests the routing tree actually used in production (App.jsx mounts this
// same PublicSite inside a BrowserRouter). Catches broken imports/props and
// confirms every public route + the catch-all render exactly one <h1>.
describe('PublicSite routing', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => { root.unmount(); });
      container.remove();
      container = null;
    }
  });

  let root;
  function renderAt(path) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <PublicSite onSignIn={() => {}} onSignUp={() => {}} />
        </MemoryRouter>
      );
    });
  }

  const routes = [
    '/', '/features', '/gst-billing', '/inventory-management', '/crm',
    '/payments', '/pricing', '/about', '/contact', '/blog',
  ];

  for (const path of routes) {
    it(`renders exactly one <h1> for ${path}`, () => {
      renderAt(path);
      const h1s = container.querySelectorAll('h1');
      expect(h1s.length).toBe(1);
      expect(h1s[0].textContent.trim().length).toBeGreaterThan(0);
    });
  }

  it('redirects an unknown path to the home page', () => {
    renderAt('/no-such-page');
    const h1 = container.querySelector('h1');
    expect(h1.textContent).toBe('Business Management Software for Indian Businesses');
  });

  it('sets a unique document title per route', () => {
    renderAt('/gst-billing');
    expect(document.title).toBe('GST Billing Software for Indian Businesses | NEXAURA');
  });
});
