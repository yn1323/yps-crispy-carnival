import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getFeatureVisibility,
  isLineCommonLinkCanonicalReady,
  requireShopMembershipAdditionEnabled,
  useCanonicalLineCommonLinkReads,
} from "./config";

describe("LINE common link rollout gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, "", "true", "ENABLED", " enabled 以外"])("exact enabled以外はfail closedにする: %s", (value) => {
    vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READY", value);

    expect(isLineCommonLinkCanonicalReady()).toBe(false);
    expect(getFeatureVisibility().shopMembershipAddition).toBe(false);
    expect(() => requireShopMembershipAdditionEnabled()).toThrow("現在、店舗や所属を追加できません");
  });

  it("exact enabledだけ複数店舗のwriterを開放する", () => {
    vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READY", "enabled");

    expect(isLineCommonLinkCanonicalReady()).toBe(true);
    expect(getFeatureVisibility().shopMembershipAddition).toBe(true);
    expect(() => requireShopMembershipAdditionEnabled()).not.toThrow();
  });

  it("canonical readは公開gateと独立し、exact enabledの時だけ切り替える", () => {
    vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READS", " enabled ");
    expect(useCanonicalLineCommonLinkReads()).toBe(true);

    vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READS", "true");
    expect(useCanonicalLineCommonLinkReads()).toBe(false);
  });
});
