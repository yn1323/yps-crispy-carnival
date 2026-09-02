// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@/src/providers/ChakraProvider";
import { SubmitUnavailableView } from ".";

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

function renderView(reason: "usage_limit_exceeded" | "usage_limit_evaluation_unavailable") {
  return render(
    <ChakraProvider>
      <SubmitUnavailableView reason={reason} />
    </ChakraProvider>,
  );
}

describe("SubmitUnavailableView", () => {
  it("利用上限超過を受付終了と区別し、管理者への整理・プラン変更依頼を案内する", () => {
    renderView("usage_limit_exceeded");

    expect(screen.getByRole("heading", { name: "現在のプランでは提出できません" })).not.toBeNull();
    expect(screen.getByText(/利用人数・店舗・管理者がプランの上限を超えています/)).not.toBeNull();
    expect(screen.getByText(/利用状況の整理またはプラン変更を依頼してください/)).not.toBeNull();
    expect(screen.queryByText(/提出受付は終了しました/)).toBeNull();
  });

  it("利用数の判定不能を上限超過と断定せず、管理者への確認を案内する", () => {
    renderView("usage_limit_evaluation_unavailable");

    expect(screen.getByRole("heading", { name: "現在、希望シフトを提出できません" })).not.toBeNull();
    expect(screen.getByText(/利用数を安全に確認できないため/)).not.toBeNull();
    expect(screen.getByText(/利用人数・店舗・管理者の確認を依頼してください/)).not.toBeNull();
    expect(screen.queryByText(/上限を超えています/)).toBeNull();
    expect(screen.queryByText(/提出受付は終了しました/)).toBeNull();
  });
});
