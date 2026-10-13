import { useMemo } from "react";
import source from "../content/measure.md?raw";
import { ReadingPage } from "../components/ReadingPage";
import { useBundle } from "../data/BundleContext";
import { describe, FIELD_DOCS } from "../data/glossary";
import { Chevron } from "../components/Plate";
import type { Bundle } from "../data/types";
import { liveBase } from "../data/load";
import { CopyButton } from "../components/CopyButton";

/** The fixed measurement inputs, published under corpus/ in the data bucket (tools/upload_data.py --corpus-dir). */
export const CORPUS_FILES = ["pile10k_sel.json", "wiki_gh.json", "uncheatable_2026_04.json", "weird.json", "names.json"] as const;

function Corpora() {
  const base = liveBase();
  const root = base ? `${base}/corpus` : "<data bucket>/corpus";
  const script = [
    "mkdir -p corpus && cd corpus",
    `for f in ${CORPUS_FILES.join(" ")} SHA256SUMS; do`,
    `  curl -fSLO "${root}/$f"`,
    "done",
    "sha256sum -c SHA256SUMS && cd ..",
  ].join("\n");
  return (
    <div className="corpora">
      {base ? (
        <ul className="small">
          {[...CORPUS_FILES, "SHA256SUMS"].map((f) => (
            <li key={f}>
              <a className="mono" href={`${root}/${f}`}>
                {f}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small ink2">
          This build has no data bucket configured (VITE_DATA_BASE_URL), so the download links cannot be shown here; the files are
          under <span className="mono">corpus/</span> next to the published bundles.
        </p>
      )}
      <pre className="code">
        <code>{script}</code>
        <CopyButton className="copy" text={script} />
      </pre>
    </div>
  );
}

interface Row {
  key: string;
  type: string;
  nullable: number;
  total: number;
}

function typeOf(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/** Field inventory of the loaded bundle: per-model keys with types and how often they are null. */
export function contractRows(bundle: Bundle): Row[] {
  const rows = new Map<string, { types: Set<string>; nulls: number }>();
  const visit = (prefix: string, v: unknown, depth: number) => {
    const t = typeOf(v);
    const r = rows.get(prefix) ?? { types: new Set<string>(), nulls: 0 };
    if (t === "null") r.nulls++;
    else r.types.add(t);
    rows.set(prefix, r);
    if (t === "object" && depth < 2 && prefix !== "fingerprint" && prefix !== "weird")
      for (const [k, x] of Object.entries(v as object)) visit(`${prefix}.${k}`, x, depth + 1);
  };
  for (const m of bundle.models) for (const [k, v] of Object.entries(m)) visit(k, v, 0);
  return Array.from(rows.entries()).map(([key, r]) => ({ key, type: Array.from(r.types).join(" | ") || "null", nullable: r.nulls, total: bundle.models.length }));
}

function DataContract() {
  const bundle = useBundle();
  const rows = contractRows(bundle);
  return (
    <details className="disclosure">
      <summary>
        <Chevron /> Fields of models[] in the loaded bundle ({rows.length})
      </summary>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">field</th>
              <th scope="col">type</th>
              <th scope="col" className="n">
                null in
              </th>
              <th scope="col">description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="mono small">{r.key}</td>
                <td className="small">{r.type}</td>
                <td className="n small">
                  {r.nullable} / {r.total}
                </td>
                <td className="small ink2">{FIELD_DOCS[r.key] ?? describe(r.key.split(".").pop() ?? "") ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function Measure() {
  const blocks = useMemo(() => ({ corpora: () => <Corpora />, datacontract: () => <DataContract /> }), []);
  return <ReadingPage source={source} blocks={blocks} docTitle="Measure your model · True Base Bench" />;
}
