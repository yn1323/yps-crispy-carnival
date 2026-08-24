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
  it("Standard上限をStandardとして表示する", () => {
    const billing = {
      state: "restricted",
      currentPlan: null,
      limitPlan: "standard",
      peopleUsage: { current: 20, max: 25 },
      shopUsage: { current: 2, max: 3 },
      managerUsage: { current: 2, max: 3 },
    } satisfies OrganizationUsageSummary;

    render(
      <ChakraProvider>
        <OrganizationUsageSection billing={billing} />
      </ChakraProvider>,
    );

    expect(screen.getByText("現在はStandardの上限が適用されています")).not.toBeNull();
    expect(screen.queryByText("現在はProの上限が適用されています")).toBeNull();
  });
});
