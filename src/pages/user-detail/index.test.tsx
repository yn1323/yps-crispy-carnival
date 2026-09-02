// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  getUserDetailRef: Symbol("getUserDetail"),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/staff">{children}</a>,
}));
vi.mock("convex/react", () => ({ useQuery: mocks.useQuery }));
vi.mock("@/convex/_generated/api", () => ({
  api: { appOrganization: { detailQueries: { getUserDetail: mocks.getUserDetailRef } } },
}));
vi.mock("@/src/components/features/UserDetail", () => ({
  UserDetailSkeleton: () => <output>loading</output>,
  UserDetail: ({ data, organizationId }: { data: { person: { id: string } }; organizationId: string }) => (
    <div>
      <output data-testid="person">{data.person.id}</output>
      <output data-testid="expected-organization">{organizationId}</output>
    </div>
  ),
}));
vi.mock("@/src/components/templates/AuthenticatedPageContent", () => ({
  AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT: {},
  AuthenticatedPageContent: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/src/components/templates/Header", () => ({ HEADER_HEIGHT: { base: "48px", md: "64px" } }));
vi.mock("@/src/components/ui/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
  DefaultErrorFallback: () => <output>error</output>,
}));
vi.mock("@/src/components/ui/Button", () => ({
  Button: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/src/components/ui/Empty", () => ({ Empty: () => <output>empty</output> }));

import { AppUserDetailPage } from ".";

beforeEach(() => {
  mocks.useQuery.mockReset();
});

describe("AppUserDetailPage", () => {
  it("URLのcanonical organizationとpersonで詳細を読み、legacy店舗をauthorityにしない", () => {
    mocks.useQuery.mockReturnValue({ person: { id: "person-target" } });

    render(<AppUserDetailPage personId="person-target" organizationId={"organization-a" as Id<"organizations">} />);

    expect(mocks.useQuery).toHaveBeenCalledExactlyOnceWith(mocks.getUserDetailRef, {
      organizationId: "organization-a",
      personId: "person-target",
      now: expect.any(Number),
    });
    expect(screen.getByTestId("person").textContent).toBe("person-target");
    expect(screen.getByTestId("expected-organization").textContent).toBe("organization-a");
  });

  it("別組織・削除済み人物を表すnullはEmptyへ寄せる", () => {
    mocks.useQuery.mockReturnValue(null);

    render(<AppUserDetailPage personId="person-target" organizationId={"organization-a" as Id<"organizations">} />);

    expect(screen.getByText("empty").textContent).toBe("empty");
  });
});
