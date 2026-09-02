import { describe, expect, expectTypeOf, it } from "vitest";
import { resolveAppNavigationTarget } from "./appNavigationTargetResolver";

describe("resolveAppNavigationTarget", () => {
  it.each([
    "/dashboard",
    "/shifts",
    "/staff",
    "/actions",
    "/manage",
    "/manage/managers",
    "/shifts/recruitment-a/board",
    "/staff/person-a",
  ] as const)("%sへ現在の組織を引き継ぐ", (to) => {
    expect(resolveAppNavigationTarget(to, "org-a")).toEqual({
      to,
      search: { org: "org-a" },
    });
  });

  it("空の組織はsearchへ持ち込まない", () => {
    expect(resolveAppNavigationTarget("/dashboard", "  ")).toEqual({
      to: "/dashboard",
      search: {},
    });
  });

  it("accountは組織scopeから分離する", () => {
    const target = resolveAppNavigationTarget("/account", "org-a");

    expect(target).toEqual({ to: "/account", search: {} });
    expectTypeOf(target.search).toEqualTypeOf<Readonly<{ org?: never }>>();
  });
});
