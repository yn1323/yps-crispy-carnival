export const webMeasurementRouteFamilies = [
  "home",
  "features",
  "feature_detail",
  "help_index",
  "help_guide",
  "contact",
  "articles_index",
  "article_detail",
  "article_category",
  "demo_shiftboard",
  "legal",
  "utility",
  "auth_signup",
  "auth_login",
  "auth_password_reset",
  "manager_invite",
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
  "staff_submit",
  "staff_submit_completed",
  "staff_view",
  "staff_reissue",
  "staff_register",
  "staff_legal_consent",
  "callback",
  "not_found",
] as const;

export type WebMeasurementRouteFamily = (typeof webMeasurementRouteFamilies)[number];

export const webMeasurementRouteAreas = ["public", "auth", "manager", "staff", "other"] as const;

export type WebMeasurementRouteArea = (typeof webMeasurementRouteAreas)[number];

// Recordにして、route familyを追加したときに所属areaの決め忘れを型検査で止める。
const routeAreaByFamily: Record<WebMeasurementRouteFamily, WebMeasurementRouteArea> = {
  home: "public",
  features: "public",
  feature_detail: "public",
  help_index: "public",
  help_guide: "public",
  contact: "public",
  articles_index: "public",
  article_detail: "public",
  article_category: "public",
  demo_shiftboard: "public",
  legal: "other",
  utility: "other",
  auth_signup: "auth",
  auth_login: "auth",
  auth_password_reset: "auth",
  manager_invite: "auth",
  dashboard: "manager",
  account: "manager",
  actions: "manager",
  organization_management: "manager",
  billing: "manager",
  manager_management: "manager",
  shop_detail: "manager",
  shift_management: "manager",
  shiftboard: "manager",
  shift_export: "manager",
  staff_management: "manager",
  staff_detail: "manager",
  staff_shop: "manager",
  staff_submit: "staff",
  staff_submit_completed: "staff",
  staff_view: "staff",
  staff_reissue: "staff",
  staff_register: "staff",
  staff_legal_consent: "staff",
  callback: "other",
  not_found: "other",
};

// IDを含むrouteは、ページ単位の集計でIDごとに行が分かれないよう固定のpathへ置き換える。
const templatedPagePaths: Partial<Record<WebMeasurementRouteFamily, string>> = {
  shop_detail: "/manage/shops/:shopId",
  shiftboard: "/shifts/:recruitmentId/board",
  shift_export: "/shifts/:recruitmentId/export",
  staff_detail: "/staff/:personId",
  staff_shop: "/staff/:personId/shops/:shopId",
};

// 未知URLのpathには任意の文字列が入り得るため、入力されたpathを送らない。
export const NOT_FOUND_MEASUREMENT_PAGE_PATH = "/404";

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
  ["/forgot-password", "auth_password_reset"],
  ["/help", "help_index"],
  ["/help/basics/notifications", "help_guide"],
  ["/help/basics/organization-structure", "help_guide"],
  ["/help/scenarios/shift-management", "help_guide"],
  ["/help/scenarios/shift-export", "help_guide"],
  ["/legal/staff/consent", "staff_legal_consent"],
  ["/line/callback", "callback"],
  ["/login", "auth_login"],
  ["/manager-invite", "manager_invite"],
  ["/privacy", "legal"],
  ["/privacy/manager", "legal"],
  ["/privacy/staff", "legal"],
  ["/shifts/reissue", "staff_reissue"],
  ["/shifts/submit", "staff_submit"],
  ["/shifts/submit/completed", "staff_submit_completed"],
  ["/shifts/view", "staff_view"],
  ["/signup", "auth_signup"],
  ["/sso-callback", "callback"],
  ["/staff/register", "staff_register"],
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
  const pathname = normalizeMeasurementPathname(value).toLowerCase();
  const fixedFamily = fixedRouteFamilies.get(pathname);
  if (fixedFamily) return fixedFamily;

  if (/^\/features\/[^/]+$/.test(pathname)) {
    return "feature_detail";
  }
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

export function getWebMeasurementRouteArea(routeFamily: WebMeasurementRouteFamily): WebMeasurementRouteArea {
  return routeAreaByFamily[routeFamily];
}

/** 集計用のpathを返す。queryとhashを除き、IDを含むrouteは固定のpathへ置き換える。 */
export function getMeasurementPagePath(value: string): string {
  const pathname = normalizeMeasurementPathname(value).toLowerCase();
  const routeFamily = getWebMeasurementRouteFamily(pathname);
  if (routeFamily === "not_found") return NOT_FOUND_MEASUREMENT_PAGE_PATH;
  const templatedPath = templatedPagePaths[routeFamily];
  if (templatedPath) return pathname.startsWith("/app/") ? `/app${templatedPath}` : templatedPath;
  return pathname;
}
