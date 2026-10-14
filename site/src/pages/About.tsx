import { useMemo } from "react";
import source from "../content/about.md?raw";
import { ReadingPage } from "../components/ReadingPage";
import { useLoaded } from "../data/BundleContext";
import { CopyButton } from "../components/CopyButton";
import { SITE_URL } from "../lib/config";

/** BibTeX entry for the loaded bundle: version and year come from the bundle, never typed. */
export function citationFor(file: string, generated: string | null | undefined): string {
  const version = file.replace(/\.json$/, "");
  const year = /^(\d{4})/.exec(String(generated ?? ""))?.[1] ?? "n.d.";
  return [
    "@misc{truebasebench,",
    "  title        = {True Base Bench: a reference-free measure of distance from a pre-anneal pretraining base},",
    "  author       = {{Anima Labs}},",
    `  year         = {${year}},`,
    `  howpublished = {\\url{${SITE_URL}}},`,
    `  note         = {Data bundle ${version.replace(/_/g, "\\_")}${generated ? `, generated ${generated}` : ""}}`,
    "}",
  ].join("\n");
}

function Citation() {
  const { file, bundle } = useLoaded();
  const text = citationFor(file, bundle.generated);
  return (
    <pre className="code">
      <code>{text}</code>
      <CopyButton className="copy" text={text} />
    </pre>
  );
}

export default function About() {
  const loaded = useLoaded();
  const blocks = useMemo(() => ({ citation: () => <Citation /> }), []);
  const values = useMemo(
    () => ({
      bundle: () => <code>{loaded.file}</code>,
    }),
    [loaded.file],
  );
  return <ReadingPage source={source} blocks={blocks} values={values} docTitle="About · True Base Bench" />;
}
