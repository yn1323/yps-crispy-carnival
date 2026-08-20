import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { Route as AppRootRoute } from "./app";
import { Route as ActionsRoute } from "./app_.actions";
import { Route as ManageRoute } from "./app_.manage";
import { Route as BillingRoute } from "./app_.manage_.billing";
import { Route as ManagersRoute } from "./app_.manage_.managers";
import { Route as InviteNewRoute } from "./app_.manage_.managers_.invite-new";
import { Route as InviteStaffRoute } from "./app_.manage_.managers_.invite-staff";
import { Route as OrganizationRoute } from "./app_.manage_.organization";
import { Route as ShopDetailRoute } from "./app_.manage_.shops.$shopId";
import { Route as ShiftsRoute } from "./app_.shifts";
import { Route as ShiftBoardRoute } from "./app_.shifts_.$recruitmentId_.board";
import { Route as StaffRoute } from "./app_.staff";
import { Route as StaffDetailRoute } from "./app_.staff_.$personId";
import { Route as StaffShopDetailRoute } from "./app_.staff_.$personId_.shops.$shopId";

type LegacyRoute = {
  options: {
    validateSearch?: (search: Record<string, unknown>) => Record<string, unknown>;
    beforeLoad?: (context: { params: Record<string, string>; search: Record<string, unknown> }) => unknown;
  };
};

function getRedirectOptions(
  route: LegacyRoute,
  rawSearch: Record<string, unknown>,
  params: Record<string, string> = {},
) {
  const search = route.options.validateSearch?.(rawSearch) ?? {};

  try {
    route.options.beforeLoad?.({ params, search });
  } catch (error) {
    expect(isRedirect(error)).toBe(true);
    if (!isRedirect(error)) throw error;
    return error.options;
  }

  throw new Error("legacy route must redirect");
}

const unsafeSearch = {
  org: " organization-a ",
  shopFilter: " shop-a ",
  token: "secret",
  email: "manager@example.com",
  unknown: "value",
};

describe("legacy /app redirect routes", () => {
  it("/app rootはorgだけを保ってDashboardへreplaceする", () => {
    expect(getRedirectOptions(AppRootRoute as LegacyRoute, unsafeSearch)).toMatchObject({
      to: "/dashboard",
      search: { org: "organization-a" },
      replace: true,
    });
  });

  it.each([
    [ActionsRoute, "/actions"],
    [ShiftsRoute, "/shifts"],
    [StaffRoute, "/staff"],
  ] as const)("一覧routeは許可した組織・店舗filterだけをcanonical URLへ渡す", (route, to) => {
    expect(getRedirectOptions(route as LegacyRoute, unsafeSearch)).toMatchObject({
      to,
      search: { org: "organization-a", shopFilter: "shop-a" },
      replace: true,
    });
  });

  it.each([
    [ManageRoute, "/manage"],
    [ManagersRoute, "/manage/managers"],
    [InviteNewRoute, "/manage/managers/invite-new"],
    [InviteStaffRoute, "/manage/managers/invite-staff"],
    [OrganizationRoute, "/manage/organization"],
  ] as const)("組織routeはorgだけをcanonical URLへ渡す", (route, to) => {
    expect(getRedirectOptions(route as LegacyRoute, unsafeSearch)).toMatchObject({
      to,
      search: { org: "organization-a" },
      replace: true,
    });
  });

  it("課金routeは許可したStripe帰還状態だけをcanonical URLへ渡す", () => {
    expect(getRedirectOptions(BillingRoute as LegacyRoute, { ...unsafeSearch, stripe: "cancelled" })).toMatchObject({
      to: "/manage/billing",
      search: { org: "organization-a", stripe: "cancelled" },
      replace: true,
    });
  });

  it.each([
    [ShopDetailRoute, "/manage/shops/$shopId", { shopId: "shop-a" }, { shopId: "shop-a" }],
    [
      ShiftBoardRoute,
      "/shifts/$recruitmentId/board",
      { recruitmentId: "recruitment-a" },
      { recruitmentId: "recruitment-a" },
    ],
    [StaffDetailRoute, "/staff/$personId", { personId: "person-a" }, { personId: "person-a" }],
    [
      StaffShopDetailRoute,
      "/staff/$personId/shops/$shopId",
      { personId: "person-a", shopId: "shop-a" },
      { personId: "person-a", shopId: "shop-a" },
    ],
  ] as const)("詳細routeはparamとorgだけをcanonical URLへ再構築する", (route, to, params, expectedParams) => {
    expect(getRedirectOptions(route as LegacyRoute, unsafeSearch, params)).toMatchObject({
      to,
      params: expectedParams,
      search: { org: "organization-a" },
      replace: true,
    });
  });
});
