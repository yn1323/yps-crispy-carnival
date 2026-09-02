// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  queryRef: Symbol("getActionInbox"),
  useQuery: vi.fn(),
  initialResult: undefined as unknown,
  additionalResult: undefined as unknown,
}));

vi.mock("convex/react", () => ({ useQuery: mocks.useQuery }));
vi.mock("@/convex/_generated/api", () => ({
  api: { appOrganization: { actionInboxQueries: { getActionInbox: mocks.queryRef } } },
}));

import { type ActionInboxQueryResult, useActionInboxData } from "./useActionInboxData";

const organizationId = "organization-1" as Id<"organizations">;
const shopId = "shop-1" as Id<"shops">;

beforeEach(() => {
  vi.useRealTimers();
  mocks.useQuery.mockReset();
  mocks.initialResult = emptyResult();
  mocks.additionalResult = undefined;
  mocks.useQuery.mockImplementation((reference: unknown, args: unknown) => {
    if (reference !== mocks.queryRef) throw new Error("Unexpected query reference");
    if (args === "skip") return undefined;
    return (args as { loadMore?: unknown }).loadMore ? mocks.additionalResult : mocks.initialResult;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useActionInboxData", () => {
  it("active orgとshop filterを初期queryへ渡す", () => {
    renderHook(() => useActionInboxData({ organizationId, shopFilter: shopId }));

    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.queryRef, {
      organizationId,
      shopFilter: shopId,
      refreshBucket: 0,
    });
  });

  it("nextRefreshAt到来時に追加pageを破棄してserver時刻判定を再評価する", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T00:00:00.000Z"));
    const extra = shiftItem("shift:extra", "recruitment-extra");
    mocks.initialResult = {
      ...emptyResult(),
      continuationByKind: { shift: "cursor-1" },
      hasMoreByKind: { shift: true },
      nextRefreshAt: Date.now() + 1_000,
    };
    mocks.additionalResult = { ...emptyResult(), items: [extra] };
    const { result } = renderHook(() => useActionInboxData({ organizationId, shopFilter: "all" }));

    await act(async () => result.current.loadMore());
    expect(result.current.items.map((item) => item.id)).toEqual([extra.id]);
    expect(result.current.canLoadMore).toBe(false);

    act(() => vi.advanceTimersByTime(1_050));

    expect(result.current.items).toEqual([]);
    expect(result.current.canLoadMore).toBe(true);
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.queryRef, {
      organizationId,
      shopFilter: "all",
      refreshBucket: 1,
    });
  });

  it("source別cursorで続きを取得し、重複なく一覧へ追加する", async () => {
    const first = shiftItem("shift:first", "recruitment-first");
    const second = shiftItem("shift:second", "recruitment-second");
    mocks.initialResult = {
      ...emptyResult(),
      items: [first],
      continuationByKind: { shift: "cursor-1" },
      hasMoreByKind: { shift: true },
    };
    mocks.additionalResult = { ...emptyResult(), items: [first, second] };
    const { result } = renderHook(() => useActionInboxData({ organizationId, shopFilter: "all" }));

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual([first.id, second.id]));
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.queryRef, {
      organizationId,
      shopFilter: "all",
      refreshBucket: 0,
      loadMore: { kind: "shift", cursor: "cursor-1" },
    });
    expect(result.current.canLoadMore).toBe(false);
  });

  it("scope変更時は追加pageを破棄して新しいfilterの先頭から取得する", async () => {
    const extra = shiftItem("shift:extra", "recruitment-extra");
    mocks.initialResult = {
      ...emptyResult(),
      continuationByKind: { shift: "cursor-1" },
      hasMoreByKind: { shift: true },
    };
    mocks.additionalResult = { ...emptyResult(), items: [extra] };
    const { result, rerender } = renderHook(({ shopFilter }) => useActionInboxData({ organizationId, shopFilter }), {
      initialProps: { shopFilter: "all" as "all" | Id<"shops"> },
    });
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    mocks.initialResult = emptyResult();
    rerender({ shopFilter: shopId });

    await waitFor(() => expect(result.current.items).toEqual([]));
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.queryRef, {
      organizationId,
      shopFilter: shopId,
      refreshBucket: 0,
    });
  });

  it("明示refreshで追加pageとcursor overrideを破棄して先頭を再取得する", async () => {
    const extra = shiftItem("shift:extra", "recruitment-extra");
    mocks.initialResult = {
      ...emptyResult(),
      continuationByKind: { shift: "cursor-1" },
      hasMoreByKind: { shift: true },
    };
    mocks.additionalResult = { ...emptyResult(), items: [extra] };
    const { result } = renderHook(() => useActionInboxData({ organizationId, shopFilter: "all" }));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual([extra.id]));
    expect(result.current.canLoadMore).toBe(false);

    act(() => result.current.refresh());

    expect(result.current.items).toEqual([]);
    expect(result.current.canLoadMore).toBe(true);
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.queryRef, {
      organizationId,
      shopFilter: "all",
      refreshBucket: 1,
    });
  });

  it("refresh後の先頭query読込中は直前の初期pageを保持して全画面loadingへ戻さない", () => {
    const first = shiftItem("shift:first", "recruitment-first");
    mocks.initialResult = { ...emptyResult(), items: [first] };
    const { result, rerender } = renderHook(() => useActionInboxData({ organizationId, shopFilter: "all" }));

    mocks.initialResult = undefined;
    act(() => result.current.refresh());
    rerender();

    expect(result.current.isLoading).toBe(false);
    expect(result.current.items.map((item) => item.id)).toEqual([first.id]);
    expect(result.current.canLoadMore).toBe(false);
  });

  it("画面へ復帰したとき追加pageを破棄して先頭を再取得する", async () => {
    const extra = shiftItem("shift:extra", "recruitment-extra");
    mocks.initialResult = {
      ...emptyResult(),
      continuationByKind: { shift: "cursor-1" },
      hasMoreByKind: { shift: true },
    };
    mocks.additionalResult = { ...emptyResult(), items: [extra] };
    const visibilityState = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const { result } = renderHook(() => useActionInboxData({ organizationId, shopFilter: "all" }));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual([extra.id]));

    act(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(result.current.items).toEqual([]);
    expect(result.current.canLoadMore).toBe(true);
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.queryRef, {
      organizationId,
      shopFilter: "all",
      refreshBucket: 1,
    });
    visibilityState.mockRestore();
  });
});

function emptyResult(): ActionInboxQueryResult {
  return {
    items: [],
    continuationByKind: {},
    hasMoreByKind: {},
  };
}

function shiftItem(id: string, recruitmentId: string): ActionInboxQueryResult["items"][number] {
  return {
    id,
    kind: "shift",
    scope: { kind: "shop", organizationId, shopId },
    recruitmentId: recruitmentId as Id<"recruitments">,
    shopName: "yn1323店舗",
    periodStart: "2026-08-17",
    periodEnd: "2026-08-24",
    deadline: "2026-08-12",
    responseCount: 2,
    totalStaffCount: 3,
    occurredAt: 1,
  };
}
