import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import site from "../../site.config.json";

describe("site.config.json (canonical URL, name, description for the sharing tags and the OG image)", () => {
  it("has an https URL without a trailing slash, a name and a description of at most 160 characters", () => {
    expect(site.url).toMatch(/^https:\/\/[^/]+$/);
    expect(site.name.length).toBeGreaterThan(0);
    expect(site.description.length).toBeLessThanOrEqual(160);
    expect(site.description.length).toBeGreaterThan(40);
  });
  it("index.html uses the placeholders the Vite plugin fills, and nothing else of that shape", () => {
    const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
    for (const k of ["__SITE_URL__", "__SITE_NAME__", "__SITE_DESCRIPTION__"]) expect(html).toContain(k);
    expect(html).toContain('property="og:image" content="__SITE_URL__/og.png"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html.match(/__[A-Z_]+__/g)?.every((p) => ["__SITE_URL__", "__SITE_NAME__", "__SITE_DESCRIPTION__"].includes(p))).toBe(true);
  });
});
