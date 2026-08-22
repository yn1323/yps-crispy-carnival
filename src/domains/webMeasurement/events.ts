import type { Metric } from "web-vitals";
import type { MeasuredPublicRouteFamily } from "./routePolicy";

export const webMeasurementEnvironments = ["local", "develop", "preview", "production"] as const;
export type WebMeasurementEnvironment = (typeof webMeasurementEnvironments)[number];

export const publicCtaIds = [
  "header_login",
  "header_signup",
  "hero_signup",
  "hero_demo",
  "bottom_signup",
  "bottom_demo",
  "feature_demo",
  "demo_complete_signup",
] as const;
export type PublicCtaId = (typeof publicCtaIds)[number];

export type ViewportClass = "mobile" | "desktop";

export type WebMeasurementContext = {
  environment: WebMeasurementEnvironment;
  releaseId: string;
};

export type WebMeasurementEvent =
  | {
      kind: "page_view";
      routeFamily: MeasuredPublicRouteFamily;
    }
  | {
      kind: "public_cta";
      ctaId: PublicCtaId;
      routeFamily: MeasuredPublicRouteFamily;
    }
  | {
      kind: "demo_value_reached";
      routeFamily: "demo_flow";
    }
  | {
      kind: "web_vital";
      documentRouteFamily: MeasuredPublicRouteFamily;
      metricName: "CLS" | "FCP" | "INP" | "LCP" | "TTFB";
      metricValue: number;
      navigationType: Metric["navigationType"];
      rating: Metric["rating"];
      viewportClass: ViewportClass;
    };

export type SerializedWebMeasurementEvent =
  | {
      event: "page_view";
      app_environment: WebMeasurementEnvironment;
      release_id: string;
      route_family: MeasuredPublicRouteFamily;
    }
  | {
      event: "select_content";
      app_environment: WebMeasurementEnvironment;
      content_id: PublicCtaId;
      content_type: "public_cta";
      release_id: string;
      route_family: MeasuredPublicRouteFamily;
    }
  | {
      event: "tutorial_complete";
      app_environment: WebMeasurementEnvironment;
      flow_name: "shiftori_demo";
      release_id: string;
      route_family: "demo_flow";
    }
  | {
      event: "web_vital";
      app_environment: WebMeasurementEnvironment;
      document_route_family: MeasuredPublicRouteFamily;
      metric_name: "CLS" | "FCP" | "INP" | "LCP" | "TTFB";
      metric_value: number;
      metric_rating: Metric["rating"];
      navigation_type: Metric["navigationType"];
      release_id: string;
      viewport_class: ViewportClass;
    };

const environmentSet = new Set<string>(webMeasurementEnvironments);
const metricNames = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"] as const);
const metricRatings = new Set(["good", "needs-improvement", "poor"] as const);
const navigationTypes = new Set([
  "navigate",
  "reload",
  "back-forward",
  "back-forward-cache",
  "prerender",
  "restore",
] as const);

export function normalizeWebMeasurementEnvironment(value: string): WebMeasurementEnvironment {
  return environmentSet.has(value) ? (value as WebMeasurementEnvironment) : "local";
}

export function normalizeReleaseId(value: string): string {
  const normalized = value.trim();
  return /^[A-Za-z0-9._-]{1,64}$/.test(normalized) ? normalized : "unknown";
}

export function getViewportClass(width: number): ViewportClass {
  return width < 768 ? "mobile" : "desktop";
}

export function buildWebVitalEvent(
  metric: Pick<Metric, "name" | "navigationType" | "rating" | "value">,
  documentRouteFamily: MeasuredPublicRouteFamily,
  viewportClass: ViewportClass,
): Extract<WebMeasurementEvent, { kind: "web_vital" }> | null {
  if (
    !metricNames.has(metric.name) ||
    !metricRatings.has(metric.rating) ||
    !navigationTypes.has(metric.navigationType) ||
    !Number.isFinite(metric.value) ||
    metric.value < 0
  ) {
    return null;
  }

  return {
    kind: "web_vital",
    documentRouteFamily,
    metricName: metric.name,
    metricValue: metric.value,
    navigationType: metric.navigationType,
    rating: metric.rating,
    viewportClass,
  };
}

export function serializeWebMeasurementEvent(
  event: WebMeasurementEvent,
  context: WebMeasurementContext,
): SerializedWebMeasurementEvent {
  const base = {
    app_environment: context.environment,
    release_id: normalizeReleaseId(context.releaseId),
  } as const;

  switch (event.kind) {
    case "page_view":
      return {
        event: "page_view",
        ...base,
        route_family: event.routeFamily,
      };
    case "public_cta":
      return {
        event: "select_content",
        ...base,
        content_id: event.ctaId,
        content_type: "public_cta",
        route_family: event.routeFamily,
      };
    case "demo_value_reached":
      return {
        event: "tutorial_complete",
        ...base,
        flow_name: "shiftori_demo",
        route_family: event.routeFamily,
      };
    case "web_vital":
      return {
        event: "web_vital",
        ...base,
        document_route_family: event.documentRouteFamily,
        metric_name: event.metricName,
        metric_value: event.metricValue,
        metric_rating: event.rating,
        navigation_type: event.navigationType,
        viewport_class: event.viewportClass,
      };
  }
}
