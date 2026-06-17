import createDOMPurify, { type WindowLike } from "dompurify";

const ALLOWED_TAGS = ["p", "br", "strong", "em", "b", "i", "u", "ul", "ol", "li", "a"] as const;
const ALLOWED_ATTR = ["href"] as const;
const SAFE_URL_PATTERN = /^(https?:|mailto:|tel:|\/(?!\/)|#)/i;

export function sanitizeDashboardAnnouncementHtml(html: string, ownerWindow: WindowLike = window): string {
  const domPurify = createDOMPurify(ownerWindow);
  const sanitized = domPurify.sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...ALLOWED_ATTR],
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
  });

  const documentRef = ownerWindow.document;
  if (!documentRef) return sanitized;

  const template = documentRef.createElement("template");
  template.innerHTML = sanitized;
  for (const anchor of Array.from(template.content.querySelectorAll("a"))) {
    const href = anchor.getAttribute("href")?.trim() ?? "";
    if (!SAFE_URL_PATTERN.test(href)) {
      anchor.removeAttribute("href");
      continue;
    }
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noreferrer");
  }

  return template.innerHTML;
}
