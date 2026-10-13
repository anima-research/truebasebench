/** Site-level configuration from the build environment. */
export const ORG_URL = "https://github.com/anima-research";
/** Optional: repository URL used to link script names (e.g. https://github.com/<org>/<repo>). */
export const SOURCE_REPO_URL = ((import.meta.env?.VITE_SOURCE_REPO_URL as string | undefined) ?? "").replace(/\/+$/, "");
export function docsLink(file: string): string | null {
  return SOURCE_REPO_URL ? `${SOURCE_REPO_URL}/blob/main/docs/${file}` : null;
}
