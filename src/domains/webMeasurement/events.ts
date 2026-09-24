import type { Metric } from "web-vitals";
import {
  getWebMeasurementRouteArea,
  type WebMeasurementRouteArea,
  type WebMeasurementRouteFamily,
} from "./routePolicy";

export const webMeasurementEnvironments = ["local", "develop", "preview", "production"] as const;
export type WebMeasurementEnvironment = (typeof webMeasurementEnvironments)[number];

export const publicCtaIds = [
  "header_login",
  "header_signup",
  "hero_signup",
  "hero_help",
  "bottom_signup",
  "bottom_help",
  "article_cta",
  "feature_hero_signup",
  "feature_bottom_signup",
] as const;
export type PublicCtaId = (typeof publicCtaIds)[number];

export type ViewportClass = "mobile" | "desktop";

export type SetupKind = "first" | "additional";
export type SubmissionPatternKind = "time" | "dateOnly" | "shiftType";
export type MeasuredPageSection = "pricing";
export type ShiftExportFormat = "pdf" | "xlsx";
export type CheckoutPlan = "standard" | "pro";

export type WebMeasurementContext = {
  environment: WebMeasurementEnvironment;
  releaseId: string;
};

/** 画面の操作から送るイベント。route familyは送信時の現在pathから決める。 */
export type ProductMeasurementInput =
  | { kind: "setup_complete"; setupKind: SetupKind; submissionPattern: SubmissionPatternKind }
  | { kind: "section_view"; section: MeasuredPageSection }
  | { kind: "shift_export"; format: ShiftExportFormat }
  | { kind: "help_search"; hasResults: boolean }
  | { kind: "plan_checkout_start"; plan: CheckoutPlan };

export type WebMeasurementEvent =
  | {
      kind: "page_view";
      routeFamily: WebMeasurementRouteFamily;
      pageLocation: string;
      pageReferrer?: string;
    }
  | {
      kind: "public_cta";
      ctaId: PublicCtaId;
      routeFamily: WebMeasurementRouteFamily;
    }
  | (ProductMeasurementInput & { routeFamily: WebMeasurementRouteFamily })
  | {
      kind: "web_vital";
      documentRouteFamily: WebMeasurementRouteFamily;
      metricName: "CLS" | "FCP" | "INP" | "LCP" | "TTFB";
      metricValue: number;
      navigationType: Metric["navigationType"];
      rating: Metric["rating"];
      viewportClass: ViewportClass;
    };

type SerializedBase = {
  app_environment: WebMeasurementEnvironment;
  release_id: string;
};

type SerializedRouteContext = SerializedBase & {
  route_area: WebMeasurementRouteArea;
  route_family: WebMeasurementRouteFamily;
};

export type SerializedWebMeasurementEvent =
  | (SerializedRouteContext & { event: "page_view"; page_location: string; page_referrer?: string })
  | (SerializedRouteContext & { event: "select_content"; content_id: PublicCtaId; content_type: "public_cta" })
  | (SerializedRouteContext & {
      event: "setup_complete";
      setup_kind: SetupKind;
      submission_pattern: SubmissionPatternKind;
    })
  | (SerializedRouteContext & { event: "section_view"; section: MeasuredPageSection })
  | (SerializedRouteContext & { event: "shift_export"; format: ShiftExportFormat })
  | (SerializedRouteContext & { event: "help_search"; has_results: "true" | "false" })
  | (SerializedRouteContext & { event: "plan_checkout_start"; plan: CheckoutPlan })
  | (SerializedBase & {
      event: "web_vital";
      document_route_family: WebMeasurementRouteFamily;
      metric_name: "CLS" | "FCP" | "INP" | "LCP" | "TTFB";
      metric_value: number;
      metric_rating: Metric["rating"];
      navigation_type: Metric["navigationType"];
      viewport_class: ViewportClass;
    });

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
  documentRouteFamily: WebMeasurementRouteFamily,
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
  if (event.kind === "web_vital") {
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

  const route = {
    ...base,
    route_area: getWebMeasurementRouteArea(event.routeFamily),
    route_family: event.routeFamily,
  } as const;
  switch (event.kind) {
    case "page_view":
      return {
        event: "page_view",
        ...route,
        page_location: event.pageLocation,
        ...(event.pageReferrer ? { page_referrer: event.pageReferrer } : {}),
      };
    case "public_cta":
      return { event: "select_content", ...route, content_id: event.ctaId, content_type: "public_cta" };
    case "setup_complete":
      return {
        event: "setup_complete",
        ...route,
        setup_kind: event.setupKind,
        submission_pattern: event.submissionPattern,
      };
    case "section_view":
      return { event: "section_view", ...route, section: event.section };
    case "shift_export":
      return { event: "shift_export", ...route, format: event.format };
    case "help_search":
      return { event: "help_search", ...route, has_results: event.hasResults ? "true" : "false" };
    case "plan_checkout_start":
      return { event: "plan_checkout_start", ...route, plan: event.plan };
  }
}
