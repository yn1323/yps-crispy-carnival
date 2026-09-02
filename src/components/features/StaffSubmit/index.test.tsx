// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  submitShiftRequests: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("./useSubmitShiftRequests", () => ({ useSubmitShiftRequests: () => mocks.submitShiftRequests }));
vi.mock("./ShiftSubmitPage", () => ({
  ShiftSubmitPage: ({
    onSubmit,
    headerAction,
  }: {
    onSubmit: (input: { kind: "time"; requests: [] }) => void;
    headerAction?: ReactNode;
  }) => (
    <div>
      {headerAction}
      <button type="button" onClick={() => onSubmit({ kind: "time", requests: [] })}>
        提出する
      </button>
    </div>
  ),
}));

import { StaffSubmit } from ".";
import { submitStoryBaseData } from "./fixtures";

beforeEach(() => {
  mocks.navigate.mockReset().mockResolvedValue(undefined);
  mocks.submitShiftRequests.mockReset().mockResolvedValue(undefined);
});

describe("StaffSubmit", () => {
  it("提出成功後はclient由来の店舗名ではなく募集IDを完了URLへ渡す", async () => {
    render(
      <StaffSubmit
        data={submitStoryBaseData}
        session={{ sessionToken: "session-token", recruitmentId: "recruitment-id" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "提出する" }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/shifts/submit/completed",
        search: { recruitmentId: "recruitment-id" },
      });
    });
    expect(mocks.submitShiftRequests).toHaveBeenCalledWith({ kind: "time", requests: [] }, undefined);
  });
});
