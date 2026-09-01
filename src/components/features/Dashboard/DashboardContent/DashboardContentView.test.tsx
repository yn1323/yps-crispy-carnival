// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecruitmentManagementState } from "../RecruitmentManagement";
import type { StaffManagementState } from "../StaffManagement";
import type { StaffRegistrationRequestManagementState } from "../StaffRegistrationRequestManagement";
import { DashboardContentView, type DashboardContentViewProps } from "./DashboardContentView";

const probes = vi.hoisted(() => ({
  onboardingDismissed: true,
  onboardingVisible: false,
  operationContextMounts: 0,
}));

vi.mock("@chakra-ui/react", () => ({
  Stack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/src/components/templates/ContentWrapper", () => ({
  ContentWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../DashboardOnboarding", () => ({
  DashboardOnboarding: ({
    children,
    canShow,
  }: {
    children: (state: {
      content: ReactNode;
      isDismissed: boolean;
      isVisible: boolean;
      onOpenRecruitment: () => void;
    }) => ReactNode;
    canShow: boolean;
  }) =>
    children({
      content: probes.onboardingVisible && canShow ? <section aria-label="シフトリへようこそ！" /> : null,
      isDismissed: probes.onboardingDismissed,
      isVisible: probes.onboardingVisible && canShow,
      onOpenRecruitment: () => {},
    }),
}));

vi.mock("../HomeScreenInstallGuidePrompt", () => ({
  HomeScreenInstallGuidePrompt: () => <aside aria-label="ホーム画面への追加案内" />,
}));

vi.mock("../OperationContext", () => ({
  OperationContext: () => {
    const [mountId] = useState(() => ++probes.operationContextMounts);
    return <p data-testid="operation-context">mount-{mountId}</p>;
  },
  OperationContextSkeleton: () => <p>店舗情報を読み込み中</p>,
}));

vi.mock("../HeroSummary", () => ({
  HeroSummary: () => <p data-testid="hero-summary">要対応</p>,
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
    probes.onboardingDismissed = true;
    probes.onboardingVisible = false;
    probes.operationContextMounts = 0;
  });

  it("オンボーディング表示中はホーム画面への追加案内を表示しない", () => {
    probes.onboardingDismissed = false;
    probes.onboardingVisible = true;

    render(<DashboardContentView {...buildProps({ status: "ready", data: registrationRequestData })} />);

    expect(screen.getByRole("region", { name: "シフトリへようこそ！" })).not.toBeNull();
    expect(screen.queryByRole("complementary", { name: "ホーム画面への追加案内" })).toBeNull();
  });

  it("オンボーディングが消えたら同じ枠へホーム画面への追加案内を表示する", () => {
    render(<DashboardContentView {...buildProps({ status: "ready", data: registrationRequestData })} />);

    expect(screen.queryByRole("region", { name: "シフトリへようこそ！" })).toBeNull();
    const prompt = screen.getByRole("complementary", { name: "ホーム画面への追加案内" });
    const heroSummary = screen.getByTestId("hero-summary");
    expect(prompt.compareDocumentPosition(heroSummary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("オンボーディングを評価できるまではホーム画面への追加案内を表示しない", () => {
    render(<DashboardContentView {...buildProps({ status: "loading" })} />);

    expect(screen.queryByRole("complementary", { name: "ホーム画面への追加案内" })).toBeNull();
  });

  it("オンボーディングが未完了のまま一時的に非表示なら追加案内を表示しない", () => {
    probes.onboardingDismissed = false;
    probes.onboardingVisible = true;
    const props = buildProps({ status: "ready", data: registrationRequestData });

    render(
      <DashboardContentView
        {...props}
        managerLegalConsentStatus={{
          required: true,
          documents: {
            terms: { title: "利用規約", path: "/terms" },
            privacy: { title: "プライバシーポリシー", path: "/privacy" },
          },
        }}
      />,
    );

    expect(screen.queryByRole("region", { name: "シフトリへようこそ！" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "ホーム画面への追加案内" })).toBeNull();
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
