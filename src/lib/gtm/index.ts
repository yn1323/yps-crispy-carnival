declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

let initialized = false;

// GTM の読み込みは初期描画後（requestIdleCallback）まで遅延するため、それより前に
// 発生した page_view / カスタムイベントを取りこぼさないよう一時バッファに退避し、
// initGTM 時に dataLayer へ順序どおり流し込む。
let pendingEvents: Record<string, unknown>[] = [];

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
  // StartのSSGはNodeで実行され、この関数はclient entryからだけ呼ばれる。
  if (!gtmId || initialized) return;
  initialized = true;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  // 遅延読み込み前にバッファした page_view / イベントを順序どおり流し込む
  for (const event of pendingEvents) {
    window.dataLayer.push(event);
  }
  pendingEvents = [];

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
  const payload = { event: "page_view", page_path: path };
  if (!initialized) {
    pendingEvents.push(payload);
    return;
  }
  window.dataLayer?.push(payload);
};

export const sendEvent = (event: string, params?: Record<string, unknown>): void => {
  const payload = { event, ...params };
  if (!initialized) {
    pendingEvents.push(payload);
    return;
  }
  window.dataLayer?.push(payload);
};

export const resetGTM = (): void => {
  initialized = false;
  pendingEvents = [];
};
