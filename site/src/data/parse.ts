/**
 * The analysis scripts write Python-style JSON, which can contain bare NaN / Infinity tokens
 * (e.g. surnames.junk for models whose sampled lists did not run). JSON.parse rejects them,
 * so they are mapped to null outside string literals before parsing. Null means "not measured".
 */
export function sanitizeJsonText(text: string): string {
  let out = "";
  let i = 0;
  let last = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      i++;
      while (i < n && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
      i++;
      continue;
    }
    let tok: string | null = null;
    if (c === "N" && text.startsWith("NaN", i)) tok = "NaN";
    else if (c === "I" && text.startsWith("Infinity", i)) tok = "Infinity";
    else if (c === "-" && text.startsWith("-Infinity", i)) tok = "-Infinity";
    if (tok) {
      out += text.slice(last, i) + "null";
      i += tok.length;
      last = i;
      continue;
    }
    i++;
  }
  return last === 0 ? text : out + text.slice(last);
}

export function parseBundleJson<T = unknown>(text: string): T {
  return JSON.parse(sanitizeJsonText(text)) as T;
}
