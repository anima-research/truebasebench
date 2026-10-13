/**
 * Markdown -> React, via marked's lexer (no innerHTML). Two house extensions:
 *   inline  {{num:<bundle path>|<fmt>}}   -> <Num> (live, provenance-bearing)
 *   inline  {{def:<NAME>|<fmt>}}           -> <Num def> from METHOD_DEFS (a definition, not a measurement)
 *   block   {{explainer:<id>}}             -> mounts registry[id] from src/explainers, or a pending slot
 */
import { Marked, type Token, type Tokens, type TokenizerAndRendererExtension } from "marked";
import { createContext, Fragment, useContext, useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { METHOD_DEFS } from "../data/method";
import type { Fmt } from "../lib/numfmt";
import { Num } from "./Num";
import { docsLink } from "../lib/config";
import { CopyButton } from "./CopyButton";
import { ExplainerSlot } from "../explainers/ExplainerSlot";

interface NumToken {
  type: "tbbnum";
  raw: string;
  kind: "num" | "def";
  path: string;
  fmt: Fmt;
}
interface ValToken {
  type: "tbbval";
  raw: string;
  name: string;
}
interface ExplainerToken {
  type: "tbbexplainer";
  raw: string;
  id: string;
  kind: "explainer" | "block";
}

/** Named blocks a page can provide to its markdown via {{block:<name>}}. */
export type BlockMap = Record<string, () => ReactNode>;
/** Named inline values (computed on the page, e.g. a derived range) for {{val:<name>}}. */
export type ValueMap = Record<string, () => ReactNode>;
const ValuesContext = createContext<ValueMap>({});
function Val({ name }: { name: string }) {
  const values = useContext(ValuesContext);
  const v = values[name];
  return v ? <>{v()}</> : <span className="ink3">[missing value “{name}”]</span>;
}

const numExt: TokenizerAndRendererExtension = {
  name: "tbbnum",
  level: "inline",
  start: (src: string) => {
    const i = src.indexOf("{{");
    return i < 0 ? undefined : i;
  },
  tokenizer(src: string) {
    const m = /^\{\{(num|def):([^|}]+)(?:\|(\w+))?\}\}/.exec(src);
    if (!m) return undefined;
    return { type: "tbbnum", raw: m[0], kind: m[1], path: m[2].trim(), fmt: (m[3] ?? "num3") as Fmt } as NumToken;
  },
  renderer: () => "",
};
const valExt: TokenizerAndRendererExtension = {
  name: "tbbval",
  level: "inline",
  start: (src: string) => {
    const i = src.indexOf("{{val:");
    return i < 0 ? undefined : i;
  },
  tokenizer(src: string) {
    const m = /^\{\{val:([\w-]+)\}\}/.exec(src);
    if (!m) return undefined;
    return { type: "tbbval", raw: m[0], name: m[1] } as ValToken;
  },
  renderer: () => "",
};
const explainerExt: TokenizerAndRendererExtension = {
  name: "tbbexplainer",
  level: "block",
  start: (src: string) => {
    const m = /\{\{(explainer|block):/.exec(src);
    return m ? m.index : undefined;
  },
  tokenizer(src: string) {
    const m = /^\{\{(explainer|block):([\w-]+)\}\}[ \t]*(?:\n+|$)/.exec(src);
    if (!m) return undefined;
    return { type: "tbbexplainer", raw: m[0], id: m[2], kind: m[1] } as ExplainerToken;
  },
  renderer: () => "",
};

const marked = new Marked({ gfm: true });
marked.use({ extensions: [numExt, valExt, explainerExt] });

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function plain(tokens: Token[] | undefined): string {
  return (tokens ?? []).map((t) => ("tokens" in t && t.tokens ? plain(t.tokens as Token[]) : "text" in t ? String(t.text) : "")).join("");
}

function inline(tokens: Token[] | undefined): ReactNode[] {
  return (tokens ?? []).map((t, i) => {
    switch (t.type) {
      case "text": {
        const tt = t as Tokens.Text;
        return tt.tokens ? <Fragment key={i}>{inline(tt.tokens)}</Fragment> : <Fragment key={i}>{decode(tt.text)}</Fragment>;
      }
      case "escape":
        return <Fragment key={i}>{decode((t as Tokens.Escape).text)}</Fragment>;
      case "strong":
        return <strong key={i}>{inline((t as Tokens.Strong).tokens)}</strong>;
      case "em":
        return <em key={i}>{inline((t as Tokens.Em).tokens)}</em>;
      case "del":
        return <del key={i}>{inline((t as Tokens.Del).tokens)}</del>;
      case "codespan": {
        const text = decode((t as Tokens.Codespan).text);
        const m = /^(vh_\w+\.py)$/.exec(text);
        const href = m ? docsLink(m[1]) : null;
        return href ? (
          <a key={i} href={href}>
            <code>{text}</code>
          </a>
        ) : (
          <code key={i}>{text}</code>
        );
      }
      case "br":
        return <br key={i} />;
      case "link": {
        const l = t as Tokens.Link;
        const kids = inline(l.tokens);
        if (l.href.startsWith("/") || l.href.startsWith("#"))
          return l.href.startsWith("#") ? (
            <a key={i} href={l.href}>
              {kids}
            </a>
          ) : (
            <Link key={i} to={l.href}>
              {kids}
            </Link>
          );
        return (
          <a key={i} href={l.href} rel="noopener noreferrer">
            {kids}
          </a>
        );
      }
      case "image": {
        const im = t as Tokens.Image;
        return <img key={i} src={im.href} alt={im.text} style={{ maxWidth: "100%" }} />;
      }
      case "tbbval":
        return <Val key={i} name={(t as unknown as ValToken).name} />;
      case "tbbnum": {
        const n = t as unknown as NumToken;
        if (n.kind === "def") {
          const v = METHOD_DEFS[n.path];
          return <Num key={i} path={`method.${n.path}`} value={v ?? null} fmt={n.fmt} def />;
        }
        return <Num key={i} path={n.path} fmt={n.fmt} />;
      }
      default:
        return <Fragment key={i}>{"raw" in t ? decode(String(t.raw)) : null}</Fragment>;
    }
  });
}

function decode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** "Title {#id}" -> explicit id */
function headingId(tokens: Token[] | undefined): { id: string; strip: boolean } {
  const text = plain(tokens);
  const m = /\{#([\w-]+)\}\s*$/.exec(text);
  return m ? { id: m[1], strip: true } : { id: slug(text), strip: false };
}
function stripId(tokens: Token[] | undefined): Token[] {
  const ts = [...(tokens ?? [])];
  const last = ts[ts.length - 1];
  if (last && last.type === "text") ts[ts.length - 1] = { ...last, text: (last as Tokens.Text).text.replace(/\s*\{#[\w-]+\}\s*$/, ""), tokens: undefined } as Token;
  return ts;
}

function blocks(tokens: Token[], extra: BlockMap = {}): ReactNode[] {
  return tokens.map((t, i) => {
    switch (t.type) {
      case "space":
      case "html":
        return null;
      case "heading": {
        const h = t as Tokens.Heading;
        const { id, strip } = headingId(h.tokens);
        const kids = inline(strip ? stripId(h.tokens) : h.tokens);
        if (h.depth === 1) return <h1 key={i} id={id}>{kids}</h1>;
        if (h.depth === 2) return <h2 key={i} id={id}>{kids}</h2>;
        return <h3 key={i} id={id}>{kids}</h3>;
      }
      case "paragraph":
        return <p key={i}>{inline((t as Tokens.Paragraph).tokens)}</p>;
      case "text":
        return <p key={i}>{inline((t as Tokens.Text).tokens ?? [t])}</p>;
      case "blockquote":
        return <blockquote key={i}>{blocks((t as Tokens.Blockquote).tokens, extra)}</blockquote>;
      case "hr":
        return <hr key={i} style={{ border: 0, borderTop: "1px solid var(--rule)" }} />;
      case "code": {
        const c = t as Tokens.Code;
        return (
          <pre key={i} className="code">
            <code>{c.text}</code>
            <CopyButton className="copy" text={c.text} />
          </pre>
        );
      }
      case "list": {
        const l = t as Tokens.List;
        const items = l.items.map((it, j) => (
          <li key={j}>{it.tokens.length === 1 && it.tokens[0].type === "text" ? inline((it.tokens[0] as Tokens.Text).tokens) : blocks(it.tokens, extra)}</li>
        ));
        return l.ordered ? (
          <ol key={i} start={typeof l.start === "number" ? l.start : undefined}>
            {items}
          </ol>
        ) : (
          <ul key={i}>{items}</ul>
        );
      }
      case "table": {
        const tb = t as Tokens.Table;
        return (
          <div key={i} className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  {tb.header.map((h, j) => (
                    <th key={j} scope="col" style={{ textAlign: tb.align[j] ?? undefined }}>
                      {inline(h.tokens)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tb.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td key={k} style={{ textAlign: tb.align[k] ?? undefined }}>
                        {inline(c.tokens)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case "tbbexplainer": {
        const e = t as unknown as ExplainerToken;
        if (e.kind === "explainer") return <ExplainerSlot key={i} id={e.id} />;
        const B = extra[e.id];
        return <Fragment key={i}>{B ? B() : <p className="ink3">[missing block “{e.id}”]</p>}</Fragment>;
      }
      default:
        return null;
    }
  });
}

export function lex(src: string): Token[] {
  return marked.lexer(src);
}

export function headingsOf(src: string, depth = 2): { id: string; text: string }[] {
  return lex(src)
    .filter((t): t is Tokens.Heading => t.type === "heading" && (t as Tokens.Heading).depth === depth)
    .map((h) => ({ id: headingId(h.tokens).id, text: plain(h.tokens).replace(/\s*\{#[\w-]+\}\s*$/, "") }));
}

/** Strip a leading front-matter-like title line "# Title" and return it separately. */
export function splitTitle(src: string): { title: string | null; body: string } {
  const m = /^#\s+(.+)\n+/.exec(src);
  return m ? { title: m[1].trim(), body: src.slice(m[0].length) } : { title: null, body: src };
}

const NO_VALUES: ValueMap = {};
export function Markdown({ source, blocks: extra = {}, values = NO_VALUES }: { source: string; blocks?: BlockMap; values?: ValueMap }) {
  const nodes = useMemo(() => blocks(lex(source), extra), [source, extra]);
  return (
    <ValuesContext.Provider value={values}>
      <div className="prose">{nodes}</div>
    </ValuesContext.Provider>
  );
}

/** Split a markdown body at its level-2 headings: the intro before the first one, then one entry per "## Title {#id}". */
export function sectionsOf(src: string): { intro: string; sections: { id: string; title: string; body: string }[] } {
  const parts = src.split(/^(?=## )/m);
  const intro = parts[0].startsWith("## ") ? "" : parts.shift() ?? "";
  const sections = parts.map((p) => {
    const nl = p.indexOf("\n");
    const line = (nl < 0 ? p : p.slice(0, nl)).replace(/^##\s+/, "").trim();
    const m = /\s*\{#([\w-]+)\}\s*$/.exec(line);
    const title = m ? line.slice(0, m.index).trim() : line;
    return { id: m ? m[1] : slug(title), title, body: nl < 0 ? "" : p.slice(nl + 1) };
  });
  return { intro, sections };
}
