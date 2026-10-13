import { useEffect, useMemo } from "react";
import { headingsOf, Markdown, splitTitle, type BlockMap, type ValueMap } from "./Markdown";
import { useScrollSpy } from "../lib/useScrollSpy";

/** A reading page rendered from markdown (src/content/*.md): rail from ## headings, prose in the main track. */
export function ReadingPage({
  source,
  blocks,
  values,
  docTitle,
  before,
}: {
  source: string;
  blocks?: BlockMap;
  values?: ValueMap;
  docTitle: string;
  before?: React.ReactNode;
}) {
  const { title, body } = useMemo(() => splitTitle(source), [source]);
  const heads = useMemo(() => headingsOf(body, 2), [body]);
  const ids = useMemo(() => heads.map((h) => h.id), [heads]);
  const active = useScrollSpy(ids);
  useEffect(() => {
    document.title = docTitle;
  }, [docTitle]);
  return (
    <div className="container">
      <div className="reading">
        <nav className="rail" aria-label="On this page">
          <div className="rail-inner">
            <ol>
              {heads.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`} aria-current={active === h.id ? "true" : undefined}>
                    {h.text}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
        <div className="wide">
          <header className="page-head">
            <h1>{title}</h1>
            <ul className="chiprow" aria-label="On this page">
              {heads.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`} aria-current={active === h.id ? "true" : undefined}>
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </header>
          {before}
          <Markdown source={body} blocks={blocks} values={values} />
        </div>
      </div>
    </div>
  );
}
