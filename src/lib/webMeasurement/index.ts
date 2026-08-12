import {
  buildWebVitalEvent,
  classifyWebMeasurementRoute,
  getViewportClass,
  normalizeMeasurementPathname,
  normalizeReleaseId,
  normalizeWebMeasurementEnvironment,
  type PublicCtaId,
  serializeWebMeasurementEvent,
  type WebMeasurementContext,
} from "@/src/domains/webMeasurement";
import { initGTM, isGtmInitialized, isValidGtmId, pushGtmEvent, resetGTM, stopGTM } from "@/src/lib/gtm";
import reportWebVitals, { type WebVitalsReporter } from "@/src/reportWebVitals";

export type WebMeasurementRuntimeConfig = {
  enabled: boolean;
  environment: string;
  gtmId: string;
  releaseId: string;
  webVitalsSampleRate: number;
};

type DocumentMeasurementContext = {
  context: WebMeasurementContext;
  documentRouteFamily: Extract<
    ReturnType<typeof classifyWebMeasurementRoute>,
    { surface: "measured_public" }
  >["routeFamily"];
  viewportClass: ReturnType<typeof getViewportClass>;
};

type RuntimeDependencies = {
  random?: () => number;
  reportVitals?: (reporter: WebVitalsReporter) => Promise<void>;
};

let documentContext: DocumentMeasurementContext | null = null;
let lastPageViewPathname: string | null = null;
let webVitalsStarted = false;
const deployMeasurementEnvironments = new Set(["develop", "preview", "production"]);

function normalizeSampleRate(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function isWebMeasurementRuntimeEnabled(config: WebMeasurementRuntimeConfig): boolean {
  const releaseId = normalizeReleaseId(config.releaseId);
  return (
    config.enabled &&
    isValidGtmId(config.gtmId) &&
    deployMeasurementEnvironments.has(config.environment) &&
    releaseId !== "unknown" &&
    releaseId !== "local"
  );
}

export function hasActiveWebMeasurement(): boolean {
  return documentContext !== null && isGtmInitialized();
}

export function initializeDocumentWebMeasurement(
  {
    config,
    currentPathname,
    initialDocumentPathname,
    viewportWidth,
  }: {
    config: WebMeasurementRuntimeConfig;
    currentPathname: string;
    initialDocumentPathname: string;
    viewportWidth: number;
  },
  dependencies: RuntimeDependencies = {},
): "disabled" | "closed_surface" | "initialized" | "transport_unavailable" {
  if (!isWebMeasurementRuntimeEnabled(config)) return "disabled";

  const initialRoute = classifyWebMeasurementRoute(initialDocumentPathname);
  const currentRoute = classifyWebMeasurementRoute(currentPathname);
  if (initialRoute.surface !== "measured_public" || currentRoute.surface !== "measured_public") {
    return "closed_surface";
  }

  if (!documentContext) {
    documentContext = {
      context: {
        environment: normalizeWebMeasurementEnvironment(config.environment),
        releaseId: normalizeReleaseId(config.releaseId),
      },
      documentRouteFamily: initialRoute.routeFamily,
      viewportClass: getViewportClass(viewportWidth),
    };
  }

  if (!isGtmInitialized() && !initGTM(config.gtmId)) return "transport_unavailable";
  trackPublicPageView(currentPathname);

  const sampleRate = normalizeSampleRate(config.webVitalsSampleRate);
  const random = dependencies.random ?? Math.random;
  if (!webVitalsStarted && sampleRate > 0 && random() < sampleRate) {
    webVitalsStarted = true;
    const reportVitals = dependencies.reportVitals ?? reportWebVitals;
    void reportVitals((metric) => {
      if (!documentContext || !isGtmInitialized()) return;
      const event = buildWebVitalEvent(metric, documentContext.documentRouteFamily, documentContext.viewportClass);
      if (event) pushGtmEvent(serializeWebMeasurementEvent(event, documentContext.context));
    }).catch(() => {
      // 計測失敗は公開ページの操作や遷移を失敗させない。
    });
  }

  return "initialized";
}

export function trackPublicPageView(pathname: string): boolean {
  if (!documentContext || !isGtmInitialized()) return false;
  const route = classifyWebMeasurementRoute(pathname);
  if (route.surface !== "measured_public") return false;

  const normalizedPathname = normalizeMeasurementPathname(pathname);
  if (lastPageViewPathname === normalizedPathname) return false;

  const sent = pushGtmEvent(
    serializeWebMeasurementEvent({ kind: "page_view", routeFamily: route.routeFamily }, documentContext.context),
  );
  if (sent) lastPageViewPathname = normalizedPathname;
  return sent;
}

export function trackPublicCta(ctaId: PublicCtaId, pathname = window.location.pathname): boolean {
  if (!documentContext || !isGtmInitialized()) return false;
  const route = classifyWebMeasurementRoute(pathname);
  if (route.surface !== "measured_public") return false;

  return pushGtmEvent(
    serializeWebMeasurementEvent(
      { kind: "public_cta", ctaId, routeFamily: route.routeFamily },
      documentContext.context,
    ),
  );
}

export function trackDemoValueReached(pathname = window.location.pathname): boolean {
  if (!documentContext || !isGtmInitialized()) return false;
  const route = classifyWebMeasurementRoute(pathname);
  if (route.surface !== "measured_public" || route.routeFamily !== "demo_flow") return false;

  return pushGtmEvent(
    serializeWebMeasurementEvent({ kind: "demo_value_reached", routeFamily: "demo_flow" }, documentContext.context),
  );
}

export function stopDocumentWebMeasurement(): void {
  stopGTM();
  documentContext = null;
  lastPageViewPathname = null;
  webVitalsStarted = false;
}

export function resetWebMeasurementForTests(): void {
  resetGTM();
  documentContext = null;
  lastPageViewPathname = null;
  webVitalsStarted = false;
}
