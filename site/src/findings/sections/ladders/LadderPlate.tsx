/**
 * Plate L's frame (DESIGN §4.3): label row with the metric switch right-aligned, axis title printed once beside the
 * stage legend, the figure, a 'not measured' line, caption, SourceLine and the Data disclosure.
 */
import type { ReactNode } from "react";
import { Chevron, DataTable, SourceLine, type DataTableSpec } from "../../../components/Plate";
import { StageLegend } from "../../../components/Glyph";
import type { Stage } from "../../../data/types";

export function LadderPlate({
  id,
  label,
  axisTitle,
  stages,
  switchEl,
  children,
  unmeasured,
  caption,
  sources,
  data,
}: {
  id?: string;
  label: string;
  axisTitle: string;
  stages: Stage[];
  switchEl: ReactNode;
  children: ReactNode;
  unmeasured?: ReactNode;
  caption: ReactNode;
  sources: string[];
  data: DataTableSpec;
}) {
  return (
    <section className="plate ldr-plate" id={id} aria-label={label}>
      <div className="ldr-label-row">
        <p className="plate-label">{label}</p>
        {switchEl}
      </div>
      <div className="ldr-meta">
        <p className="axis-once">{axisTitle}</p>
        <StageLegend stages={stages} />
      </div>
      <figure>
        <div className="figure">{children}</div>
        {unmeasured}
        <figcaption className="caption">{caption}</figcaption>
      </figure>
      <SourceLine paths={sources} />
      <details className="data">
        <summary>
          <Chevron /> Data
        </summary>
        <div className="tbl-wrap">
          <DataTable spec={data} />
        </div>
      </details>
    </section>
  );
}
