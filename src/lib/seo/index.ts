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
export const SITE_URL = "https://shiftori.app";

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
  /** og:type override. Omit to keep the root document's `website` default. */
  ogType?: "article";
  /**
   * Page-specific OGP image. Omit to keep the root document's /ogp.png default.
   * `path` is a site-absolute path to a 1200x630 PNG. The root document owns
   * og:image:width/height/type, so route metadata overrides only URL and alt.
   */
  ogImage?: { path: string; alt: string };
};

/**
 * Build route meta tags for TanStack Router's `head` option.
 * - Appends the site name to the title (except when the title already starts with the site name)
 * - Mirrors title/description to Open Graph and Twitter Card tags
 * - Adds `robots: noindex, nofollow` when `noindex` is set
 */
export const buildMeta = ({ title, description, noindex, canonical, ogType, ogImage }: BuildMetaOptions): MetaList => {
  const hasSiteName =
    title === SITE_NAME ||
    title.startsWith(`${SITE_NAME}｜`) ||
    title.startsWith(`${SITE_NAME} | `) ||
    title.endsWith(`｜${SITE_NAME}`) ||
    title.endsWith(` | ${SITE_NAME}`);
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

  if (ogType) {
    entries.push({ property: "og:type", content: ogType });
  }

  if (ogImage) {
    const imageUrl = `${SITE_URL}${ogImage.path}`;
    entries.push({ property: "og:image", content: imageUrl });
    entries.push({ property: "og:image:secure_url", content: imageUrl });
    entries.push({ property: "og:image:alt", content: ogImage.alt });
    entries.push({ name: "twitter:image", content: imageUrl });
    entries.push({ name: "twitter:image:alt", content: ogImage.alt });
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
