import { isPrerendering } from "@/src/helpers/seo";

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

let initialized = false;

const getScriptSrc = (gtmId: string): string => `https://www.googletagmanager.com/gtm.js?id=${gtmId}`;
const getNoscriptSrc = (gtmId: string): string => `https://www.googletagmanager.com/ns.html?id=${gtmId}`;

function hasScript(gtmId: string): boolean {
  const expectedSrc = getScriptSrc(gtmId);
  return Array.from(document.head.querySelectorAll("script")).some(
    (script) => script.getAttribute("src") === expectedSrc,
  );
}

function hasNoscriptFallback(gtmId: string): boolean {
  const expectedSrc = getNoscriptSrc(gtmId);
  return Array.from(document.body.querySelectorAll("noscript iframe")).some(
    (iframe) => iframe.getAttribute("src") === expectedSrc,
  );
}

export const initGTM = (gtmId: string): void => {
  // prerender 中に起動すると、GTM が注入したタグ (Clarity 等) が page.content() で
  // 静的 HTML に焼き込まれ、実行時に GTM 発火分と二重初期化されてしまうため起動しない
  if (!gtmId || initialized || isPrerendering()) return;
  initialized = true;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const scriptSrc = getScriptSrc(gtmId);
  if (!hasScript(gtmId)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = scriptSrc;
    document.head.appendChild(script);
  }

  if (!hasNoscriptFallback(gtmId)) {
    const noscript = document.createElement("noscript");
    const iframe = document.createElement("iframe");
    iframe.src = getNoscriptSrc(gtmId);
    iframe.height = "0";
    iframe.width = "0";
    iframe.style.display = "none";
    iframe.style.visibility = "hidden";
    noscript.appendChild(iframe);
    document.body.insertBefore(noscript, document.body.firstChild);
  }
};

export const sendPageView = (path: string): void => {
  if (!initialized) return;
  window.dataLayer?.push({ event: "page_view", page_path: path });
};

export const sendEvent = (event: string, params?: Record<string, unknown>): void => {
  if (!initialized) return;
  window.dataLayer?.push({ event, ...params });
};

export const resetGTM = (): void => {
  initialized = false;
};
