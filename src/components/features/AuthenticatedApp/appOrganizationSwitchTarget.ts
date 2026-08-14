type AppOrganizationSwitchPath =
  | "/app/home"
  | "/app/shifts"
  | "/app/staff"
  | "/app/actions"
  | "/app/manage"
  | "/app/manage/organization"
  | "/app/manage/managers"
  | "/app/manage/billing";

type AppOrganizationSwitchTarget = {
  to: AppOrganizationSwitchPath;
  search: { org: string };
};

const PRESERVED_ORGANIZATION_PATHS = new Set<AppOrganizationSwitchPath>([
  "/app/home",
  "/app/shifts",
  "/app/staff",
  "/app/actions",
  "/app/manage",
  "/app/manage/organization",
  "/app/manage/managers",
  "/app/manage/billing",
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
  if (PRESERVED_ORGANIZATION_PATHS.has(pathname as AppOrganizationSwitchPath)) {
    return pathname as AppOrganizationSwitchPath;
  }

  if (pathname.startsWith("/app/shifts/")) return "/app/shifts";
  if (pathname.startsWith("/app/staff/")) return "/app/staff";
  if (pathname === "/app/manage/managers/invite-staff" || pathname === "/app/manage/managers/invite-new") {
    return "/app/manage/managers";
  }
  if (pathname.startsWith("/app/manage/shops/")) return "/app/manage";

  return null;
}
