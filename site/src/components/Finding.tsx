/**
 * Section shell for /findings (cross-cutting; owned with Findings.tsx and pages.css). A finding file exports
 * `useFindingView(bundle, F): FindingView`; the page renders it through `FindingSection`, which mounts the head at
 * the section's `{{block:fN-claim}}` slot, the legacy paragraph at `{{block:fN-detail}}`, the numbers list at
 * `{{block:fN-readoff}}` and each plate at its own slot, so content/findings.md keeps working unchanged.
 */
import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { PlateNumber } from "../explainers/kit/Shell";
import type { Check } from "../findings";
import type { Stage } from "../data/types";
import { Markdown, type BlockMap } from "./Markdown";
import { Num } from "./Num";
import { Chevron, DataNote, DataTable, SourceLine, type DataTableSpec } from "./Plate";
import { StageLegend } from "./Glyph";

/** A PlateNumber that may link to the checkpoint it was read from. */
export interface FindingNumber extends PlateNumber {
  href?: string;
}

export interface FindingView {
  /** the one-sentence claim: ≤ 2 lines (≈ 110 characters with its Nums), at most 3 <Num>s; null = the section title */
  headline: ReactNode;
  /** serif italic lead holding the remaining computed numbers */
  standfirst?: ReactNode;
  /** legacy `{{block:fN-detail}}` paragraph; fold it into `standfirst` or an aside when the section is reworked */
  detail?: ReactNode;
  /** 'Family label <Num> (<Num> vs base)' items; rendered joined by '; ' under the standfirst when non-empty */
  exceptions?: ReactNode[];
  /** margin note next to the head (use <Aside title="How this is checked">…</Aside>) */
  aside?: ReactNode;
  /** `{{block:<id>}}` plates of this section (ids listed in FINDINGS_PLATES) */
  plates: Record<string, () => ReactNode>;
  /** every value the section reads, for 'Numbers in this finding' */
  numbers: FindingNumber[];
  checks: Record<string, Check>;
}

export function joinNodes(nodes: ReactNode[], sep: ReactNode = ", "): ReactNode {
  return nodes.map((n, i) => (
    <Fragment key={i}>
      {i > 0 && sep}
      {n}
    </Fragment>
  ));
}

/** Data notes for failed checks; 'Pending.' notes for checks the bundle cannot test yet. */
export function Notes({ checks }: { checks: Record<string, Check> }) {
  return (
    <>
      {Object.entries(checks)
        .filter(([, c]) => !c.ok)
        .map(([k, c]) => (
          <DataNote key={k}>In this bundle, {c.note}.</DataNote>
        ))}
      {Object.entries(checks)
        .filter(([, c]) => c.ok && c.pending)
        .map(([k, c]) => (
          <p key={k} className="data-note pending" role="note">
            <strong>Pending.</strong> {c.note}.
          </p>
        ))}
    </>
  );
}

export function Exceptions({ items }: { items: ReactNode[] }) {
  if (!items.length) return null;
  return (
    <p className="fd-exceptions">
      <strong>Exceptions ·</strong> {joinNodes(items, "; ")}
    </p>
  );
}

/** Margin note: in the margin column at ≥ 1100, an inline aside with a 2px left rule below. */
export function Aside({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="fd-aside">
      <p className="kicker">{title}</p>
      {children}
    </aside>
  );
}

export function FindingHead({
  id,
  kicker,
  headline,
  standfirst,
  exceptions,
  aside,
  checks,
}: {
  id: string;
  kicker: string;
  headline: ReactNode;
  standfirst?: ReactNode;
  exceptions?: ReactNode[];
  aside?: ReactNode;
  checks: Record<string, Check>;
}) {
  return (
    <div className="with-margin fd-head">
      <div className="wm-main">
        <p className="kicker">{kicker}</p>
        <h2 id={`${id}-h`} className="fd-headline">
          {headline}
        </h2>
        {standfirst && <p className="fd-standfirst">{standfirst}</p>}
        {/* a failing check's Data note sits between the standfirst and the named exceptions */}
        <Notes checks={checks} />
        {exceptions && exceptions.length > 0 && <Exceptions items={exceptions} />}
      </div>
      {aside && <div className="wm-margin">{aside}</div>}
    </div>
  );
}

/** 'Numbers in this finding (n)': the explainer's "Numbers in this plate" markup, each row linking to its checkpoint. */
export function NumbersList({ numbers, title = "Numbers in this finding" }: { numbers: FindingNumber[]; title?: string }) {
  const seen = new Set<string>();
  const uniq = numbers.filter((x) => {
    const k = x.path + "|" + x.label;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!uniq.length) return null;
  return (
    <details className="data">
      <summary>
        <Chevron /> {title} ({uniq.length})
      </summary>
      <ul className="xp-numbers">
        {uniq.map((x, i) => (
          <li key={i}>
            <span className="ink2">{x.href ? <Link to={x.href}>{x.label}</Link> : x.label}</span>{" "}
            <Num path={x.path} fmt={x.fmt} value={x.value} def={x.def} derived={x.derived} />{" "}
            <span className="mono ink3 xp-path">{x.def ? `definition · ${x.path}` : x.derived ? x.derived : x.path}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Plate (DESIGN §4.3) with a margin column: figure, caption, SourceLine and Data in the main column; StageLegend,
 * 'What to look at' and the numbers list in the margin (stacked under the figure below 1100px). `data` is required.
 */
export function FindingPlate({
  label,
  children,
  caption,
  sources,
  data,
  id,
  className,
  legend,
  look,
  numbers,
  aside,
}: {
  label: string;
  children: ReactNode;
  caption?: ReactNode;
  sources?: string[];
  data: DataTableSpec;
  id?: string;
  className?: string;
  /** stage legend in the margin; pass `{ hollowNote }` when hollow glyphs are used */
  legend?: boolean | { stages?: Stage[]; hollowNote?: string };
  /** 2–3 sentences with <Num>s */
  look?: ReactNode[];
  numbers?: FindingNumber[];
  aside?: ReactNode;
}) {
  const side = legend || (look && look.length) || (numbers && numbers.length) || aside;
  return (
    <section className={"plate fd-plate " + (className ?? "")} id={id} aria-label={label}>
      <p className="plate-label">{label}</p>
      <div className="fd-grid">
        <div className="fd-main">
          <figure>
            <div className="figure">{children}</div>
            {caption && <figcaption className="caption">{caption}</figcaption>}
          </figure>
          {sources && sources.length > 0 && <SourceLine paths={sources} />}
          <details className="data">
            <summary>
              <Chevron /> Data
            </summary>
            <div className="tbl-wrap">
              <DataTable spec={data} />
            </div>
          </details>
        </div>
        {side && (
          <div className="fd-side">
            {legend && <StageLegend {...(legend === true ? {} : legend)} />}
            {look && look.length > 0 && (
              <>
                <p className="kicker">What to look at</p>
                <ul className="fd-look">
                  {look.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </>
            )}
            {numbers && numbers.length > 0 && <NumbersList numbers={numbers} title="Numbers in this plate" />}
            {aside}
          </div>
        )}
      </div>
    </section>
  );
}

/** One `<section class="finding">`: head (at the claim slot or on top), then the section's markdown with its blocks. */
export function FindingSection({ id, n, title, body, view }: { id: string; n: number | null; title: string; body: string; view: FindingView }) {
  const kicker = n ? `F${n} · ${title}` : "Ladders";
  const headline = view.headline ?? title;
  const head = <FindingHead id={id} kicker={kicker} headline={headline} standfirst={view.standfirst} exceptions={view.exceptions} aside={view.aside} checks={view.checks} />;
  const headInBody = body.includes(`{{block:${id}-claim}}`);
  const blocks: BlockMap = {
    ...view.plates,
    [`${id}-claim`]: () => head,
    [`${id}-detail`]: () => view.detail ?? null,
    [`${id}-readoff`]: () => <NumbersList numbers={view.numbers} />,
  };
  return (
    <section id={id} className="finding" aria-labelledby={`${id}-h`}>
      {!headInBody && head}
      <Markdown source={body} blocks={blocks} />
    </section>
  );
}
