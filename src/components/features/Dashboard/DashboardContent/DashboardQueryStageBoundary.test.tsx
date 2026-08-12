// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardQueryStageBoundary } from "./DashboardQueryStageBoundary";

let shouldThrow = false;

function QueryProbe({ onMount }: { onMount: () => void }) {
  useState(() => {
    onMount();
    return null;
  });
  if (shouldThrow) throw new Error("query details must not be shown");
  return <p>取得済みの募集</p>;
}

function renderBoundary(onMount = vi.fn()) {
  return render(
    <DashboardQueryStageBoundary
      fallback={({ onRetry }) => (
        <button type="button" onClick={onRetry}>
          再試行する
        </button>
      )}
    >
      <QueryProbe onMount={onMount} />
    </DashboardQueryStageBoundary>,
  );
}

beforeEach(() => {
  shouldThrow = false;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DashboardQueryStageBoundary", () => {
  it("queryのrender errorを局所fallbackへ切り替える", () => {
    shouldThrow = true;

    renderBoundary();

    expect(screen.getByRole("button", { name: "再試行する" })).not.toBeNull();
    expect(screen.queryByText("query details must not be shown")).toBeNull();
  });

  it("再試行時にquery-owning childを新しいkeyでremountする", () => {
    const onMount = vi.fn();
    const { rerender } = renderBoundary(onMount);
    expect(onMount).toHaveBeenCalledOnce();

    shouldThrow = true;
    rerender(
      <DashboardQueryStageBoundary
        fallback={({ onRetry }) => (
          <button type="button" onClick={onRetry}>
            再試行する
          </button>
        )}
      >
        <QueryProbe onMount={onMount} />
      </DashboardQueryStageBoundary>,
    );
    expect(screen.getByRole("button", { name: "再試行する" })).not.toBeNull();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "再試行する" }));

    expect(screen.getByText("取得済みの募集")).not.toBeNull();
    expect(onMount).toHaveBeenCalledTimes(2);
  });

  it("再試行後もqueryが失敗する場合は局所fallbackを維持する", () => {
    shouldThrow = true;
    renderBoundary();

    fireEvent.click(screen.getByRole("button", { name: "再試行する" }));

    expect(screen.getByRole("button", { name: "再試行する" })).not.toBeNull();
  });
});
