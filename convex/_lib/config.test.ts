import { describe, expect, it } from "vitest";
import { getFeatureVisibility } from "./config";

describe("feature visibility", () => {
  it("公開済みの店舗・所属追加を常に利用可能として返す", () => {
    expect(getFeatureVisibility()).toEqual({
      organizationSettingsNavigation: true,
      billing: true,
      shopMembershipAddition: true,
    });
  });
});
