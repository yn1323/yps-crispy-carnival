import type { WebMeasurementRuntimeConfig } from "@/src/lib/webMeasurement";

const sampleRateInput = import.meta.env.VITE_WEB_VITALS_SAMPLE_RATE?.trim();
const sampleRate = Number(sampleRateInput || "1");

export const WEB_MEASUREMENT_RUNTIME_CONFIG: WebMeasurementRuntimeConfig = {
  enabled: import.meta.env.VITE_WEB_MEASUREMENT_ENABLED === "true",
  environment: __APP_ENVIRONMENT__,
  gtmId: import.meta.env.VITE_GTM_ID ?? "",
  releaseId: __RELEASE_ID__,
  webVitalsSampleRate: Number.isFinite(sampleRate) ? sampleRate : 0,
};
