/**
 * Runtime structural validation of a bundle (DESIGN §6.1 step 2). The full JSON Schema lives in
 * bench.schema.json and is enforced in tests; this is the cheap check run in the browser.
 */
import { STAGES, SUB_KEYS, type Bundle } from "./types";

export const SUPPORTED_SCHEMA_VERSIONS = [1];

export function validateBundle(b: unknown): string[] {
  const errs: string[] = [];
  if (!b || typeof b !== "object") return ["bundle is not an object"];
  const o = b as Record<string, unknown>;
  for (const k of ["schema_version", "generated", "n_models", "reference", "models"]) {
    if (!(k in o)) errs.push(`missing top-level key ${k}`);
  }
  if (typeof o.schema_version !== "number" || !SUPPORTED_SCHEMA_VERSIONS.includes(o.schema_version))
    errs.push(`unsupported schema_version ${String(o.schema_version)}`);
  if (!Array.isArray(o.models)) {
    errs.push("models is not an array");
    return errs;
  }
  if (typeof o.n_models === "number" && o.n_models !== o.models.length)
    errs.push(`n_models ${o.n_models} != models.length ${o.models.length}`);
  const ids = new Set<string>();
  (o.models as unknown[]).forEach((m, i) => {
    if (!m || typeof m !== "object") {
      errs.push(`models[${i}] is not an object`);
      return;
    }
    const r = m as Record<string, unknown>;
    const where = `models[${typeof r.id === "string" ? r.id : i}]`;
    for (const k of ["id", "family", "label"]) if (typeof r[k] !== "string") errs.push(`${where}.${k} must be a string`);
    if (typeof r.id === "string") {
      if (ids.has(r.id)) errs.push(`${where} duplicate id`);
      ids.add(r.id);
    }
    if (!STAGES.includes(r.stage as never)) errs.push(`${where}.stage invalid: ${String(r.stage)}`);
    if (typeof r.order !== "number") errs.push(`${where}.order must be a number`);
    if (r.score !== null && typeof r.score !== "number") errs.push(`${where}.score must be a number or null`);
    if (!r.subscores || typeof r.subscores !== "object") errs.push(`${where}.subscores missing`);
    else for (const k of SUB_KEYS) if (!(k in (r.subscores as object))) errs.push(`${where}.subscores.${k} missing`);
  });
  return errs;
}

export function assertBundle(b: unknown): Bundle {
  const errs = validateBundle(b);
  if (errs.length) throw new Error("Invalid bundle: " + errs.slice(0, 5).join("; "));
  return b as Bundle;
}
