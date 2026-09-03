import type { SerializedWebMeasurementEvent } from "@/src/domains/webMeasurement";

declare global {
  interface Window {
    dataLayer?: Array<SerializedWebMeasurementEvent | { "gtm.start": number; event: "gtm.js" }>;
  }
}

let initialized = false;
let transportBlocked = false;

const GTM_ID_PATTERN = /^GTM-[A-Z0-9]+$/;
const getScriptSrc = (gtmId: string): string => `https://www.googletagmanager.com/gtm.js?id=${gtmId}`;

function hasGtmScript(): boolean {
  return document.querySelector('script[src^="https://www.googletagmanager.com/gtm.js"]') !== null;
}

export function isValidGtmId(gtmId: string): boolean {
  return GTM_ID_PATTERN.test(gtmId);
}

export function isGtmInitialized(): boolean {
  return initialized;
}

export function initGTM(gtmId: string): boolean {
  if (!isValidGtmId(gtmId) || initialized || transportBlocked) return false;

  try {
    // 予期しない既存GTMがあるdocumentは二重発火を避けるため再利用しない。
    if (hasGtmScript()) {
      stopGTM();
      transportBlocked = true;
      return false;
    }
    window.dataLayer = [];
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

    const script = document.createElement("script");
    script.async = true;
    script.src = getScriptSrc(gtmId);
    document.head.appendChild(script);
    initialized = true;
    return true;
  } catch {
    initialized = false;
    transportBlocked = true;
    try {
      window.dataLayer = [];
    } catch {
      // transportを停止するbest-effort cleanup。計測失敗を製品操作へ伝播させない。
    }
    return false;
  }
}

export function pushGtmEvent(payload: SerializedWebMeasurementEvent): boolean {
  try {
    if (!initialized || !window.dataLayer) return false;
    window.dataLayer.push(payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * testと異常時のbest-effort cleanup。実行済みのthird-party codeを完全にはunloadできない。
 */
export function stopGTM(): void {
  initialized = false;
  try {
    window.dataLayer = [];
  } catch {
    // cleanup失敗を製品操作へ伝播させない。
  }
  try {
    for (const script of document.querySelectorAll('script[src^="https://www.googletagmanager.com/gtm.js"]')) {
      script.remove();
    }
  } catch {
    // 一度実行済みのthird-party codeは完全には破棄できない。ここでは新規送信の停止を優先する。
  }
}

export function resetGTM(): void {
  stopGTM();
  transportBlocked = false;
}
