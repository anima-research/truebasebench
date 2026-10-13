import type { ReactNode } from "react";
import { useLoaded } from "../data/BundleContext";

export function Chevron() {
  return (
    <svg className="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function SourceLine({ paths }: { paths: string[] }) {
  const { file } = useLoaded();
  return (
    <div className="source-line">
      {paths.map((p, i) => (
        <div key={p}>
          {i === 0 ? "Source: " : "        "}
          {file} · {p}
        </div>
      ))}
    </div>
  );
}

export interface DataTableSpec {
  columns: string[];
  rows: (string | number | ReactNode)[][];
  numeric?: boolean[];
}

export function DataTable({ spec, caption }: { spec: DataTableSpec; caption?: string }) {
  return (
    <table className="tbl">
      {caption && <caption>{caption}</caption>}
      <thead>
        <tr>
          {spec.columns.map((c, i) => (
            <th key={i} scope="col" className={spec.numeric?.[i] ? "n" : undefined}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {spec.rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) =>
              j === 0 ? (
                <th key={j} scope="row" style={{ fontWeight: 400, background: "none" }}>
                  {c}
                </th>
              ) : (
                <td key={j} className={spec.numeric?.[j] ? "n" : undefined}>
                  {c}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Plate (DESIGN §4.3): label, figure, caption, SourceLine, Data disclosure. */
export function Plate({
  label,
  children,
  caption,
  sources,
  data,
  id,
  className,
}: {
  label: string;
  children: ReactNode;
  caption?: ReactNode;
  sources?: string[];
  data?: DataTableSpec;
  id?: string;
  className?: string;
}) {
  return (
    <section className={"plate " + (className ?? "")} id={id} aria-label={label}>
      <p className="plate-label">{label}</p>
      <figure>
        <div className="figure">{children}</div>
        {caption && <figcaption className="caption">{caption}</figcaption>}
      </figure>
      {sources && sources.length > 0 && <SourceLine paths={sources} />}
      {data && (
        <details className="data">
          <summary>
            <Chevron /> Data
          </summary>
          <div className="tbl-wrap">
            <DataTable spec={data} />
          </div>
        </details>
      )}
    </section>
  );
}

export function NullPlate({ children }: { children: ReactNode }) {
  return (
    <div className="nullplate" role="note">
      <span>{children}</span>
    </div>
  );
}

export function DataNote({ children }: { children: ReactNode }) {
  return (
    <p className="data-note" role="note">
      <strong>Data note.</strong> {children}
    </p>
  );
}
