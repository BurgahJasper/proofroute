import { useEffect } from 'react';
import { Link, NavLink, Outlet, Route, Routes, useLocation } from 'react-router';
import { BriefPage } from './pages/BriefPage';
import { CasePage } from './pages/CasePage';
import { DemoPage } from './pages/DemoPage';
import { HomePage } from './pages/HomePage';
import { UiProvider, useUi, Wordmark } from './ui';

function Shell() {
  const { reduceMotion, toggleMotion } = useUi();
  const location = useLocation();
  useEffect(() => {
    const target = location.hash ? document.getElementById(location.hash.slice(1)) : document.getElementById('main');
    target?.scrollIntoView({ behavior: 'instant', block: 'start' });
    if (!location.hash) target?.focus({ preventScroll: true });
  }, [location.pathname, location.hash]);
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" className="text-ink no-underline">
            <Wordmark />
          </Link>
          <nav className="site-nav flex flex-wrap items-center gap-2 text-sm" aria-label="Main navigation">
            <Link className="inline-flex min-h-11 items-center px-2" to="/#how">
              How checks work
            </Link>
            <NavLink className="inline-flex min-h-11 items-center px-2" to="/demo">
              Samples
            </NavLink>
            <button type="button" className="motion-control" aria-pressed={reduceMotion} onClick={toggleMotion}>
              {reduceMotion ? 'Motion reduced' : 'Reduce motion'}
            </button>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer"><p>ProofRoute <span aria-hidden="true"> / </span> An evidence desk for your next opportunity.</p><p>HackUTD 2026 · Synthetic demo · Sender identity stays unverified.</p></footer>
    </>
  );
}

export function App() {
  return (
    <UiProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/cases/:caseId" element={<CasePage />} />
          <Route path="/cases/:caseId/brief" element={<BriefPage />} />
        </Route>
      </Routes>
    </UiProvider>
  );
}
