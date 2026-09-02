// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRetainedShiftBoardData } from "./useRetainedShiftBoardData";

describe("useRetainedShiftBoardData", () => {
  it("同じ店舗と募集のbackground再購読中は直前データを保持する", () => {
    const first = { recruitmentId: "recruitment-a", shifts: ["10:00"] };
    type Data = typeof first;
    const { result, rerender } = renderHook<Data | undefined, { data: Data | undefined }>(
      ({ data }: { data: typeof first | undefined }) => useRetainedShiftBoardData("shop-a:recruitment-a", data),
      { initialProps: { data: first } },
    );

    rerender({ data: undefined });

    expect(result.current).toBe(first);
  });

  it("店舗または募集が変わった場合は以前のデータを表示しない", () => {
    const first = { recruitmentId: "recruitment-a" };
    type Data = typeof first;
    type Props = { scopeKey: string; data: Data | null | undefined };
    const { result, rerender } = renderHook<Data | null | undefined, Props>(
      ({ scopeKey, data }: { scopeKey: string; data: typeof first | null | undefined }) =>
        useRetainedShiftBoardData(scopeKey, data),
      { initialProps: { scopeKey: "shop-a:recruitment-a", data: first } },
    );

    rerender({ scopeKey: "shop-b:recruitment-a", data: undefined });
    expect(result.current).toBeUndefined();

    rerender({ scopeKey: "shop-b:recruitment-a", data: null });
    rerender({ scopeKey: "shop-b:recruitment-a", data: undefined });
    expect(result.current).toBeNull();
  });
});
