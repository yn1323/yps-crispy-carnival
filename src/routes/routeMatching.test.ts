import { describe, expect, it } from "vitest";
import { getRouter } from "@/src/router";

const router = getRouter();

function getLeafRouteId(pathname: string): string | undefined {
  return router.matchRoutes(pathname).at(-1)?.routeId;
}

describe("app route matching", () => {
  it.each([
    ["/help", "/help/"],
    ["/help/tasks/staff-management", "/help/tasks/$taskId"],
    ["/help/basics/notifications", "/help/basics/notifications"],
    ["/help/basics/organization-structure", "/help/basics/organization-structure"],
    ["/help/scenarios/shift-management", "/help/scenarios/shift-management"],
    ["/help/start-shift-management", "/help/$slug"],
  ])("公開ヘルプURL %s をHelpCenter routeへ接続する", (pathname, expectedRouteId) => {
    expect(getLeafRouteId(pathname)).toBe(expectedRouteId);
  });

  it.each([
    ["/actions", "/_auth/actions"],
    ["/manage", "/_auth/manage"],
    ["/manage/billing", "/_auth/manage_/billing"],
    ["/manage/managers", "/_auth/manage_/managers"],
    ["/manage/managers/invite-new", "/_auth/manage_/managers_/invite-new"],
    ["/manage/managers/invite-staff", "/_auth/manage_/managers_/invite-staff"],
    ["/manage/organization", "/_auth/manage_/organization"],
    ["/manage/shops/shop-a", "/_auth/manage_/shops/$shopId"],
    ["/shifts", "/_auth/shifts"],
    ["/shifts/recruitment-a/board", "/_auth/shifts_/$recruitmentId_/board"],
    ["/staff", "/_auth/staff"],
    ["/staff/order", "/_auth/staff_/order"],
    ["/staff/person-a", "/_auth/staff_/$personId"],
    ["/staff/person-a/shops/shop-a", "/_auth/staff_/$personId_/shops/$shopId"],
  ])("canonical URL %s を認証routeへ接続する", (pathname, expectedRouteId) => {
    expect(getLeafRouteId(pathname)).toBe(expectedRouteId);
  });

  it.each([
    ["/app", "/_auth/app"],
    ["/app/actions", "/_auth/app_/actions"],
    ["/app/manage", "/_auth/app_/manage"],
    ["/app/manage/billing", "/_auth/app_/manage_/billing"],
    ["/app/manage/managers", "/_auth/app_/manage_/managers"],
    ["/app/manage/managers/invite-new", "/_auth/app_/manage_/managers_/invite-new"],
    ["/app/manage/managers/invite-staff", "/_auth/app_/manage_/managers_/invite-staff"],
    ["/app/manage/organization", "/_auth/app_/manage_/organization"],
    ["/app/manage/shops/shop-a", "/_auth/app_/manage_/shops/$shopId"],
    ["/app/shifts", "/_auth/app_/shifts"],
    ["/app/shifts/recruitment-a/board", "/_auth/app_/shifts_/$recruitmentId_/board"],
    ["/app/staff", "/_auth/app_/staff"],
    ["/app/staff/order", "/_auth/app_/staff_/order"],
    ["/app/staff/person-a", "/_auth/app_/staff_/$personId"],
    ["/app/staff/person-a/shops/shop-a", "/_auth/app_/staff_/$personId_/shops/$shopId"],
  ])("legacy URL %s をredirect専用routeへ接続する", (pathname, expectedRouteId) => {
    expect(getLeafRouteId(pathname)).toBe(expectedRouteId);
  });

  it.each([
    ["/staff/register", "/_unregistered/staff/register"],
    ["/shifts/submit", "/_unregistered/shifts/submit"],
    ["/shifts/submit/completed", "/_unregistered/shifts/submit_/completed"],
    ["/shifts/view", "/_unregistered/shifts/view"],
    ["/shifts/reissue", "/_unregistered/shifts/reissue"],
  ])("公開URL %s をcanonical protected dynamic routeより優先する", (pathname, expectedRouteId) => {
    expect(getLeafRouteId(pathname)).toBe(expectedRouteId);
  });

  it.each([
    ["/Staff/person-a", "/_auth/staff_/$personId"],
    ["/Staff/Order", "/_auth/staff_/order"],
    ["/Manage/Billing", "/_auth/manage_/billing"],
    ["/Staff/Register", "/_unregistered/staff/register"],
    ["/Shifts/Submit", "/_unregistered/shifts/submit"],
  ])("大小文字が異なるURL %s もRouterとpolicyが同じrouteとして扱う", (pathname, expectedRouteId) => {
    expect(getLeafRouteId(pathname)).toBe(expectedRouteId);
  });
});
