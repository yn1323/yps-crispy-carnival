// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ historyBack: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ history: { back: mocks.historyBack } }),
}));

vi.mock("@chakra-ui/react", () => ({
  Box: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Container: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Grid: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Heading: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/src/components/ui/Button", () => ({
  Button: ({
    children,
    onClick,
    "aria-label": ariaLabel,
  }: {
    children: ReactNode;
    onClick: () => void;
    "aria-label"?: string;
  }) => (
    <button type="button" aria-label={ariaLabel} onClick={onClick}>
      {children}
    </button>
  ),
}));

import { FocusedFlowHeader } from ".";

beforeEach(() => {
  mocks.historyBack.mockReset();
});

describe("FocusedFlowHeader", () => {
  it("タイトルの戻るは固定リンクではなくブラウザ履歴へ戻る", () => {
    render(<FocusedFlowHeader title="シフトを調整" backLabel="シフト一覧へ戻る" backAriaLabel="シフト一覧へ戻る" />);

    fireEvent.click(screen.getByRole("button", { name: "シフト一覧へ戻る" }));

    expect(mocks.historyBack).toHaveBeenCalledOnce();
  });
});
