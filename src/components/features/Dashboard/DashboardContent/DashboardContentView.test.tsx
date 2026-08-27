// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecruitmentManagementState } from "../RecruitmentManagement";
import type { StaffManagementState } from "../StaffManagement";
import type { StaffRegistrationRequestManagementState } from "../StaffRegistrationRequestManagement";
import { DashboardContentView, type DashboardContentViewProps } from "./DashboardContentView";

const probes = vi.hoisted(() => ({ operationContextMounts: 0 }));

vi.mock("@chakra-ui/react", () => ({
  Stack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/src/components/templates/ContentWrapper", () => ({
  ContentWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../DashboardOnboarding", () => ({
  DashboardOnboarding: ({
    children,
  }: {
    children: (state: { content: null; isVisible: false; onOpenRecruitment: () => void }) => ReactNode;
  }) => children({ content: null, isVisible: false, onOpenRecruitment: () => {} }),
}));

vi.mock("../OperationContext", () => ({
  OperationContext: () => {
    const [mountId] = useState(() => ++probes.operationContextMounts);
    return <p data-testid="operation-context">mount-{mountId}</p>;
  },
  OperationContextSkeleton: () => <p>店舗情報を読み込み中</p>,
}));

vi.mock("../HeroSummary", () => ({
  HeroSummary: () => null,
  HeroSummarySkeleton: () => null,
}));

vi.mock("../LegalReconsent", () => ({ LegalReconsent: () => null }));
vi.mock("../RecruitmentBoard", () => ({ RecruitmentBoardSkeleton: () => null }));
vi.mock("../StaffRoster", () => ({ StaffRosterSkeleton: () => null }));
vi.mock("./DashboardSectionUnavailable", () => ({ DashboardSectionUnavailable: () => null }));

const recruitmentData: RecruitmentManagementState = {
  isInitialLoading: false,
  recruitments: [],
  knownRecruitments: [],
  groups: [],
  openCreateRecruitment: vi.fn(),
  openShiftBoard: vi.fn(),
  renderContent: () => null,
};

const staffData: StaffManagementState = {
  isInitialLoading: false,
  staffs: [],
  content: null,
};

const registrationRequestData: StaffRegistrationRequestManagementState = {
  isInitialLoading: false,
  requests: [],
  actionItemCount: 0,
  content: null,
};

function buildProps(
  registrationRequests: DashboardContentViewProps["registrationRequests"],
  taskScopeKey = "shop-1",
): DashboardContentViewProps {
  return {
    taskScopeKey,
    isReadOnly: false,
    managerLegalConsentStatus: {
      required: false,
      documents: {
        terms: { title: "利用規約", path: "/terms" },
        privacy: { title: "プライバシーポリシー", path: "/privacy" },
      },
    },
    isDashboardOnboardingDismissed: false,
    recruitment: { status: "ready", data: recruitmentData },
    staff: { status: "ready", data: staffData },
    registrationRequests,
    notificationFailures: { status: "loading" },
  };
}

describe("DashboardContentView", () => {
  beforeEach(() => {
    probes.operationContextMounts = 0;
  });

  it("登録申請の取得完了で操作中の店舗コンテキストを再生成しない", () => {
    const { rerender } = render(<DashboardContentView {...buildProps({ status: "loading" })} />);

    expect(probes.operationContextMounts).toBe(1);

    rerender(
      <DashboardContentView
        {...buildProps({
          status: "ready",
          data: registrationRequestData,
        })}
      />,
    );

    expect(probes.operationContextMounts).toBe(1);
  });

  it("選択店舗が変わった場合は店舗コンテキストを新しいscopeで生成する", () => {
    const readyRegistrationRequests = {
      status: "ready" as const,
      data: registrationRequestData,
    };
    const { rerender } = render(<DashboardContentView {...buildProps(readyRegistrationRequests)} />);

    rerender(<DashboardContentView {...buildProps(readyRegistrationRequests, "shop-2")} />);

    expect(probes.operationContextMounts).toBe(2);
  });
});
