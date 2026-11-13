import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { RouteBoundary } from './components/ui';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import DocPage from './pages/Docs';
import ReportPage from './pages/Reports';
import { RuleDetail, RulesPage } from './pages/Rules';
import { LoopDetail, LoopsPage, RunDetail, RunsPage, StudioHome } from './pages/Studio';
import { useData } from './lib/data';

/** Scroll to the hash target below the sticky header, or to the top on a new page. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 60);
    return () => window.clearTimeout(t);
  }, [pathname, hash]);
  return null;
}

function SampleRibbon() {
  const { state } = useData();
  if (state.status !== 'ready' || !state.index.sample) return null;
  return <div className="ribbon">Development sample data. The shipped build uses recorded Kane runs only.</div>;
}

export default function App() {
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <SampleRibbon />
      <Header />
      <ScrollManager />
      <main id="main" className="page" tabIndex={-1}>
        <RouteBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/studio" element={<StudioHome />} />
            <Route path="/studio/runs" element={<RunsPage />} />
            <Route path="/studio/runs/:id" element={<RunDetail />} />
            <Route path="/studio/loops" element={<LoopsPage />} />
            <Route path="/studio/loops/:id" element={<LoopDetail />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/rules/:id" element={<RuleDetail />} />
            <Route path="/docs" element={<DocPage />} />
            <Route path="/docs/:slug" element={<DocPage />} />
            <Route path="/reports" element={<ReportPage />} />
            <Route path="/reports/:slug" element={<ReportPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </RouteBoundary>
      </main>
      <Footer />
    </>
  );
}
