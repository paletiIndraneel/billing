import { Routes, Route, Navigate } from 'react-router-dom';
import PublicLayout from '../../components/layout/PublicLayout';
import Home from './Home';
import Features from './Features';
import GstBilling from './GstBilling';
import InventoryManagement from './InventoryManagement';
import Crm from './Crm';
import Payments from './Payments';
import Pricing from './Pricing';
import About from './About';
import Contact from './Contact';
import Blog from './Blog';

// Mounted only while AuthGate's authState === 'landing', inside its own
// BrowserRouter (App.jsx). Never mounted alongside the authenticated app's
// HashRouter, so there's no route collision despite both trees using "/".
export default function PublicSite({ onSignIn, onSignUp }) {
  return (
    <Routes>
      <Route element={<PublicLayout onSignIn={onSignIn} onSignUp={onSignUp} />}>
        <Route index element={<Home onSignIn={onSignIn} onSignUp={onSignUp} />} />
        <Route path="features" element={<Features onSignUp={onSignUp} />} />
        <Route path="gst-billing" element={<GstBilling onSignUp={onSignUp} />} />
        <Route path="inventory-management" element={<InventoryManagement onSignUp={onSignUp} />} />
        <Route path="crm" element={<Crm onSignUp={onSignUp} />} />
        <Route path="payments" element={<Payments onSignUp={onSignUp} />} />
        <Route path="pricing" element={<Pricing onSignUp={onSignUp} />} />
        <Route path="about" element={<About onSignUp={onSignUp} />} />
        <Route path="contact" element={<Contact />} />
        <Route path="blog" element={<Blog />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
