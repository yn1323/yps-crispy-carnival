declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

let initialized = false;

export const initGTM = (gtmId: string): void => {
  if (!gtmId || initialized) return;
  initialized = true;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${gtmId}`;
  document.head.appendChild(script);

  const noscript = document.createElement("noscript");
  const iframe = document.createElement("iframe");
  iframe.src = `https://www.googletagmanager.com/ns.html?id=${gtmId}`;
  iframe.height = "0";
  iframe.width = "0";
  iframe.style.display = "none";
  iframe.style.visibility = "hidden";
  noscript.appendChild(iframe);
  document.body.insertBefore(noscript, document.body.firstChild);
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
