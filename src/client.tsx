import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { GTM_ID } from "@/src/configs/publicEnv";
import { initGTM } from "@/src/lib/gtm";
import reportWebVitals from "./reportWebVitals.ts";

// GTM(→GA4/Clarity)の読み込みを初期描画後まで遅延し、LCP/TBTと帯域を奪い合わないようにする。
const scheduleGtmInit =
  typeof window.requestIdleCallback === "function"
    ? (callback: () => void) => window.requestIdleCallback(callback, { timeout: 5000 })
    : (callback: () => void) => window.setTimeout(callback, 3000);

scheduleGtmInit(() => initGTM(GTM_ID));

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});

reportWebVitals();
