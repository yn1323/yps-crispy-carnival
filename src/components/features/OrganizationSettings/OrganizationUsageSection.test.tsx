// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@/src/providers/ChakraProvider";
import { OrganizationUsageSection, type OrganizationUsageSummary } from "./OrganizationUsageSection";

beforeEach(() => {
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: false,
    media,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrganizationUsageSection", () => {
  it("有料プランの支払い確認中はFree上限を表示する", () => {
    const billing = {
      state: "pendingActivation",
      currentPlan: "free",
      peopleUsage: { current: 5, max: 5, pendingInvitations: 0 },
      shopUsage: { current: 1, max: 1, pendingInvitations: 0 },
      managerUsage: { current: 1, max: 2, pendingInvitations: 0 },
    } satisfies OrganizationUsageSummary;

    render(
      <ChakraProvider>
        <OrganizationUsageSection billing={billing} />
      </ChakraProvider>,
    );

    expect(screen.getByText("現在はFreeの上限が適用されています")).not.toBeNull();
  });
});
