/**
 * SEO helpers for TanStack Router's `head` option.
 *
 * TanStack Router's public `meta` type is typed as HTML `<meta>` attributes,
 * but its runtime also recognizes `{ title }` (renders `<title>`) and
 * `{ "script:ld+json": payload }` (renders a JSON-LD `<script>`). The entries
 * here produce runtime-valid tags; the final array is cast so the `head`
 * option accepts it.
 * @link https://tanstack.com/router/latest/docs/framework/react/guide/document-head-management
 */
import type { JSX } from "react";

const SITE_NAME = "シフトリ";
const SITE_URL = "https://shiftori.app";

type MetaList = NonNullable<JSX.IntrinsicElements["meta"]>[];
type LinkList = NonNullable<JSX.IntrinsicElements["link"]>[];

type MetaEntry =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { "script:ld+json": Record<string, unknown> };

type BuildMetaOptions = {
  title: string;
  description?: string;
  /** Set true for pages that should not be indexed (magic-link pages, authed pages). */
  noindex?: boolean;
  /** Canonical path (e.g. "/terms"). Adds `og:url`. */
  canonical?: string;
};

/**
 * Build route meta tags for TanStack Router's `head` option.
 * - Appends the site name to the title (except when the title already starts with the site name)
 * - Mirrors title/description to Open Graph and Twitter Card tags
 * - Adds `robots: noindex, nofollow` when `noindex` is set
 */
export const buildMeta = ({ title, description, noindex, canonical }: BuildMetaOptions): MetaList => {
  const hasSiteName = title === SITE_NAME || title.startsWith(`${SITE_NAME}｜`) || title.startsWith(`${SITE_NAME} | `);
  const fullTitle = hasSiteName ? title : `${title} | ${SITE_NAME}`;
  const entries: MetaEntry[] = [
    { title: fullTitle },
    { property: "og:title", content: fullTitle },
    { name: "twitter:title", content: fullTitle },
  ];

  if (description) {
    entries.push({ name: "description", content: description });
    entries.push({ property: "og:description", content: description });
    entries.push({ name: "twitter:description", content: description });
  }

  if (canonical) {
    entries.push({ property: "og:url", content: `${SITE_URL}${canonical}` });
  }

  if (noindex) {
    entries.push({ name: "robots", content: "noindex, nofollow" });
  }

  return entries as unknown as MetaList;
};

/** Build route-specific link tags such as canonical URLs. */
export const buildLinks = ({ canonical }: Pick<BuildMetaOptions, "canonical">): LinkList =>
  canonical ? ([{ rel: "canonical", href: `${SITE_URL}${canonical}` }] as LinkList) : [];

/**
 * Wrap a JSON-LD payload as a `head.meta` entry. Rendered as
 * `<script type="application/ld+json">...</script>` by TanStack Router.
 */
export const jsonLdMeta = (payload: Record<string, unknown>): MetaList =>
  [{ "script:ld+json": payload }] as unknown as MetaList;

/**
 * `scripts/prerender.ts` が `addInitScript` で `window.__PRERENDER__ = true` を
 * 注入する。コンポーネントから「これは prerender 中か」を判定する共通ヘルパ。
 * SSR/Node 実行時にも安全に false を返すため `typeof window` ガード込み。
 */
export function isPrerendering(): boolean {
  return typeof window !== "undefined" && (window as unknown as { __PRERENDER__?: boolean }).__PRERENDER__ === true;
}
