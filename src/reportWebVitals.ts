import type { MetricType } from "web-vitals";

export type WebVitalsReporter = (metric: MetricType) => void;

const reportWebVitals = async (onPerfEntry: WebVitalsReporter): Promise<void> => {
  const { onCLS, onINP, onFCP, onLCP, onTTFB } = await import("web-vitals");
  onCLS(onPerfEntry);
  onINP(onPerfEntry);
  onFCP(onPerfEntry);
  onLCP(onPerfEntry);
  onTTFB(onPerfEntry);
};

export default reportWebVitals;
