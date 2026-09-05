// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SubmissionData } from "../types";

vi.mock("../SubmitForm", () => ({
  SubmitForm: ({ data }: { data: SubmissionData }) => <div data-testid="submit-form">{data.periodEnd}</div>,
}));
vi.mock("../ReadOnlySubmitView", () => ({ ReadOnlySubmitView: () => <div data-testid="read-only" /> }));
vi.mock("../SubmitPageLayout", () => ({
  SubmitPageLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SubmitPageHeader: () => null,
}));
vi.mock("@/src/components/shared/RecruitmentChangedNotice", () => ({
  RecruitmentChangedNotice: () => <div data-testid="reload-notice" />,
}));

import { submitStoryBaseData } from "../fixtures";
import { ShiftSubmitPage } from ".";

describe("希望提出画面の募集条件変更", () => {
  it("表示中に募集が編集されたら入力欄を取り除き、再読み込みまで新条件を混在させない", () => {
    const { rerender, unmount } = render(
      <ShiftSubmitPage data={{ ...submitStoryBaseData, editVersion: 2 }} onSubmit={vi.fn()} />,
    );
    expect(screen.getByTestId("submit-form")).toBeTruthy();
    const updated = { ...submitStoryBaseData, editVersion: 3, periodEnd: "2026-04-20" };
    rerender(<ShiftSubmitPage data={updated} onSubmit={vi.fn()} />);
    expect(screen.queryByTestId("submit-form")).toBeNull();
    expect(screen.getByTestId("reload-notice")).toBeTruthy();
    unmount();
    render(<ShiftSubmitPage data={updated} onSubmit={vi.fn()} />);
    expect(screen.queryByTestId("reload-notice")).toBeNull();
    expect(screen.getByTestId("submit-form").textContent).toBe("2026-04-20");
  });
});
