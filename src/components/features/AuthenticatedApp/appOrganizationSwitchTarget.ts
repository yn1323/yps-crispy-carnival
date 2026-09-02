type AppOrganizationSwitchPath =
  | "/dashboard"
  | "/shifts"
  | "/staff"
  | "/actions"
  | "/manage"
  | "/manage/organization"
  | "/manage/managers"
  | "/manage/billing";

type AppOrganizationSwitchTarget = {
  to: AppOrganizationSwitchPath;
  search: { org: string };
};

const PRESERVED_ORGANIZATION_PATHS = new Set<AppOrganizationSwitchPath>([
  "/dashboard",
  "/shifts",
  "/staff",
  "/actions",
  "/manage",
  "/manage/organization",
  "/manage/managers",
  "/manage/billing",
]);

/**
 * 組織変更時に旧組織の店舗・人物・募集IDを持ち越さない遷移先を返す。
 * 組織だけで成立する画面は維持し、entity詳細と集中フローは親画面へ戻す。
 */
export function resolveAppOrganizationSwitchTarget(
  pathname: string,
  nextOrganizationId: string,
): AppOrganizationSwitchTarget | null {
  const organizationId = nextOrganizationId.trim();
  if (organizationId === "") return null;

  const to = resolveAppOrganizationSwitchPath(pathname);
  if (!to) return null;

  return { to, search: { org: organizationId } };
}

function resolveAppOrganizationSwitchPath(pathname: string): AppOrganizationSwitchPath | null {
  const routePathname = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const staticPathname = routePathname.toLowerCase();

  if (PRESERVED_ORGANIZATION_PATHS.has(staticPathname as AppOrganizationSwitchPath)) {
    return staticPathname as AppOrganizationSwitchPath;
  }

  if (/^\/shifts\/[^/]+\/board$/i.test(routePathname)) return "/shifts";
  if (/^\/staff\/[^/]+$/i.test(routePathname) && staticPathname !== "/staff/register") return "/staff";
  if (/^\/staff\/[^/]+\/shops\/[^/]+$/i.test(routePathname)) return "/staff";
  if (staticPathname === "/manage/managers/invite-staff" || staticPathname === "/manage/managers/invite-new") {
    return "/manage/managers";
  }
  if (/^\/manage\/shops\/[^/]+$/i.test(routePathname)) return "/manage";

  return null;
}
