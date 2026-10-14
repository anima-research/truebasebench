import type { Bundle } from "../../data/types";
import type { allFindings } from "../../findings";

/** The computed findings (src/findings.ts), passed down once from the page. */
export type Findings = ReturnType<typeof allFindings>;

/** Props every section component receives from Findings.tsx. */
export interface SectionProps {
  bundle: Bundle;
  F: Findings;
  /** the `## Title {#id}` section of content/findings.md this component renders */
  section: { id: string; title: string; body: string };
}

export type { FindingNumber, FindingView } from "../../components/Finding";
