export const measuredPublicRouteFamilies = [
  "home",
  "features",
  "faq",
  "howto",
  "contact",
  "articles_index",
  "article_detail",
  "article_category",
  "demo_flow",
  "demo_shiftboard",
] as const;

export type MeasuredPublicRouteFamily = (typeof measuredPublicRouteFamilies)[number];

export type WebMeasurementRoute =
  | { surface: "measured_public"; routeFamily: MeasuredPublicRouteFamily }
  | { surface: "public_unmeasured" }
  | { surface: "closed" };

const fixedMeasuredRoutes = new Map<string, MeasuredPublicRouteFamily>([
  ["/", "home"],
  ["/articles", "articles_index"],
  ["/contact", "contact"],
  ["/demo/flow", "demo_flow"],
  ["/demo/shiftboard", "demo_shiftboard"],
  ["/faq", "faq"],
  ["/features", "features"],
  ["/howto", "howto"],
]);

const publicUnmeasuredRoutes = new Set([
  "/account-deletion-accepted",
  "/cache-reset",
  "/commercial-transactions",
  "/privacy",
  "/privacy/manager",
  "/privacy/staff",
  "/terms",
  "/terms/manager",
  "/terms/staff",
]);

export function normalizeMeasurementPathname(value: string): string {
  const pathname = value.split(/[?#]/, 1)[0] || "/";
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

export function classifyWebMeasurementRoute(value: string): WebMeasurementRoute {
  const pathname = normalizeMeasurementPathname(value);
  const fixedFamily = fixedMeasuredRoutes.get(pathname);
  if (fixedFamily) return { surface: "measured_public", routeFamily: fixedFamily };

  if (publicUnmeasuredRoutes.has(pathname)) return { surface: "public_unmeasured" };

  if (/^\/articles\/categories\/[^/]+$/.test(pathname)) {
    return { surface: "measured_public", routeFamily: "article_category" };
  }
  if (/^\/articles\/[^/]+$/.test(pathname)) {
    return { surface: "measured_public", routeFamily: "article_detail" };
  }

  return { surface: "closed" };
}

export function isPublicMeasurementDocument(value: string): boolean {
  return classifyWebMeasurementRoute(value).surface !== "closed";
}
