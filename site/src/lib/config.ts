/** Site-level configuration from the build environment. */
import site from "../../site.config.json";
/** Canonical site URL, name and one-line description (site/site.config.json; also fills index.html's meta tags and the OG image). */
export const SITE_URL: string = site.url.replace(/\/+$/, "");
export const SITE_NAME: string = site.name;
export const SITE_DESCRIPTION: string = site.description;
export const ORG_URL = "https://github.com/anima-research";
/** Optional: repository URL used to link script names (e.g. https://github.com/<org>/<repo>). */
export const SOURCE_REPO_URL = ((import.meta.env?.VITE_SOURCE_REPO_URL as string | undefined) ?? "").replace(/\/+$/, "");
export function docsLink(file: string): string | null {
  return SOURCE_REPO_URL ? `${SOURCE_REPO_URL}/blob/main/docs/${file}` : null;
}
