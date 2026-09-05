export const webMeasurementRouteFamilies = [
  "home",
  "features",
  "help_index",
  "help_guide",
  "contact",
  "articles_index",
  "article_detail",
  "article_category",
  "demo_shiftboard",
  "legal",
  "utility",
  "auth",
  "dashboard",
  "account",
  "actions",
  "organization_management",
  "billing",
  "manager_management",
  "shop_detail",
  "shift_management",
  "shiftboard",
  "shift_export",
  "staff_management",
  "staff_detail",
  "staff_shop",
  "capability",
  "callback",
  "not_found",
] as const;

export type WebMeasurementRouteFamily = (typeof webMeasurementRouteFamilies)[number];

const fixedRouteFamilies = new Map<string, WebMeasurementRouteFamily>([
  ["/", "home"],
  ["/account", "account"],
  ["/account-deletion-accepted", "utility"],
  ["/actions", "actions"],
  ["/app", "dashboard"],
  ["/articles", "articles_index"],
  ["/cache-reset", "utility"],
  ["/commercial-transactions", "legal"],
  ["/contact", "contact"],
  ["/demo/shiftboard", "demo_shiftboard"],
  ["/features", "features"],
  ["/forgot-password", "auth"],
  ["/help", "help_index"],
  ["/help/basics/notifications", "help_guide"],
  ["/help/basics/organization-structure", "help_guide"],
  ["/help/scenarios/shift-management", "help_guide"],
  ["/legal/staff/consent", "capability"],
  ["/line/callback", "callback"],
  ["/login", "auth"],
  ["/manager-invite", "capability"],
  ["/privacy", "legal"],
  ["/privacy/manager", "legal"],
  ["/privacy/staff", "legal"],
  ["/shifts/reissue", "capability"],
  ["/shifts/submit", "capability"],
  ["/shifts/submit/completed", "capability"],
  ["/shifts/view", "capability"],
  ["/signup", "auth"],
  ["/sso-callback", "callback"],
  ["/staff/register", "capability"],
  ["/terms", "legal"],
  ["/terms/manager", "legal"],
  ["/terms/staff", "legal"],
]);

export function normalizeMeasurementPathname(value: string): string {
  const pathname = value.split(/[?#]/, 1)[0] || "/";
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

export function getWebMeasurementRouteFamily(value: string): WebMeasurementRouteFamily {
  const pathname = normalizeMeasurementPathname(value);
  const fixedFamily = fixedRouteFamilies.get(pathname);
  if (fixedFamily) return fixedFamily;

  if (/^\/articles\/categories\/[^/]+$/.test(pathname)) {
    return "article_category";
  }
  if (/^\/articles\/[^/]+$/.test(pathname)) {
    return "article_detail";
  }
  if (/^\/help\/tasks\/[^/]+$/.test(pathname)) {
    return "help_index";
  }
  if (/^\/help\/[^/]+$/.test(pathname)) {
    return "help_guide";
  }
  if (/^\/shifts\/[^/]+\/export$/.test(pathname)) {
    return "shift_export";
  }

  const appPathname = pathname.startsWith("/app/") ? pathname.slice(4) : pathname;
  if (appPathname === "/dashboard") return "dashboard";
  if (appPathname === "/actions") return "actions";
  if (appPathname === "/manage" || appPathname === "/manage/organization") return "organization_management";
  if (appPathname === "/manage/billing") return "billing";
  if (/^\/manage\/managers(?:\/invite-(?:new|staff))?$/.test(appPathname)) return "manager_management";
  if (/^\/manage\/shops\/[^/]+$/.test(appPathname)) return "shop_detail";
  if (appPathname === "/shifts") return "shift_management";
  if (/^\/shifts\/[^/]+\/board$/.test(appPathname)) return "shiftboard";
  if (appPathname === "/staff" || appPathname === "/staff/order") return "staff_management";
  if (/^\/staff\/[^/]+\/shops\/[^/]+$/.test(appPathname)) return "staff_shop";
  if (/^\/staff\/[^/]+$/.test(appPathname)) return "staff_detail";

  return "not_found";
}
