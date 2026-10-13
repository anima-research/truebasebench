import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { BundleProvider, useBundleState } from "./data/BundleContext";
import { MotionProvider } from "./lib/motion";
import { Footer, TopBar } from "./components/Chrome";
import { SvgDefs } from "./components/Bars";
import Leaderboard from "./pages/Leaderboard";

const ModelPage = lazy(() => import("./pages/ModelPage"));
const Findings = lazy(() => import("./pages/Findings"));
const Methodology = lazy(() => import("./pages/Methodology"));
const Measure = lazy(() => import("./pages/Measure"));
const About = lazy(() => import("./pages/About"));
const ExplainersReview = lazy(() => import("./pages/ExplainersReview"));

function Skeleton() {
  return (
    <div className="container" aria-busy="true" aria-label="Loading data">
      <div className="page-head">
        <div className="skeleton-row" />
      </div>
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  );
}

function RequireBundle({ children }: { children: ReactNode }) {
  const { state, retry } = useBundleState();
  if (state.status === "loading") return <Skeleton />;
  if (state.status === "error")
    return (
      <div className="container error-box" role="alert">
        <p>
          The benchmark data could not be loaded ({state.error}).{" "}
          <button type="button" className="linkbtn" onClick={retry}>
            Retry
          </button>
        </p>
      </div>
    );
  return (
    <>
      {state.loaded.fallback && (
        <div className="container notice" role="status">
          Showing bundled copy of {state.loaded.file.replace(/\.json$/, "")}; live data unavailable.
        </div>
      )}
      {children}
    </>
  );
}

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      // The target may not exist yet: the bundle and the lazily loaded page mount after navigation.
      // Poll briefly until it appears, then scroll once.
      const id = decodeURIComponent(hash.slice(1));
      let tries = 0;
      let t = 0;
      const seek = () => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView();
        else if (tries++ < 60) t = window.setTimeout(seek, 50);
      };
      t = window.setTimeout(seek, 0);
      return () => window.clearTimeout(t);
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

const TITLES: Record<string, string> = {
  "/": "True Base Bench",
  "/findings": "Findings · True Base Bench",
  "/methodology": "Methodology · True Base Bench",
  "/measure": "Measure your model · True Base Bench",
  "/about": "About · True Base Bench",
};
function TitleManager() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (TITLES[pathname]) document.title = TITLES[pathname];
  }, [pathname]);
  return null;
}

export function NotFound() {
  return (
    <div className="container page-head">
      <h1>Not found</h1>
      <p className="prose">
        There is no page at this address. <a href="/">Back to the leaderboard</a>.
      </p>
    </div>
  );
}

export function App() {
  return (
    <MotionProvider>
      <BundleProvider>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <SvgDefs />
        <ScrollManager />
        <TitleManager />
        <TopBar />
        <main id="main" tabIndex={-1}>
          <RequireBundle>
            <Suspense fallback={<Skeleton />}>
              <Routes>
                <Route path="/" element={<Leaderboard />} />
                <Route path="/model/:id" element={<ModelPage />} />
                <Route path="/findings" element={<Findings />} />
                <Route path="/methodology" element={<Methodology />} />
                <Route path="/measure" element={<Measure />} />
                <Route path="/about" element={<About />} />
                <Route path="/explainers" element={<ExplainersReview />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </RequireBundle>
        </main>
        <Footer />
      </BundleProvider>
    </MotionProvider>
  );
}
