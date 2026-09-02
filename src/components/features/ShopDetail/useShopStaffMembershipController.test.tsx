// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShopStaffMembershipChangeInput, ShopStaffMembershipData } from "./types";

const mocks = vi.hoisted(() => ({
  membershipQueryRef: Symbol("membershipQuery"),
  previewQueryRef: Symbol("previewQuery"),
  mutationRef: Symbol("mutation"),
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  mutation: vi.fn(),
  showSuccessToast: vi.fn(),
  membershipData: undefined as ShopStaffMembershipData | null | undefined,
  previewData: undefined as unknown,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    staff: {
      queries: {
        getOrganizationShopStaffMembershipChange: mocks.membershipQueryRef,
        previewOrganizationShopStaffMembershipRemovals: mocks.previewQueryRef,
      },
      mutations: {
        changeOrganizationShopStaffMemberships: mocks.mutationRef,
      },
    },
  },
}));

vi.mock("convex/react", () => ({
  useQuery: mocks.useQuery,
  useMutation: mocks.useMutation,
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showSuccessToast: mocks.showSuccessToast,
}));

import {
  buildShopStaffRemovalPreviewKey,
  type ShopStaffMembershipSubmitResult,
  useShopStaffMembershipController as useRawShopStaffMembershipController,
} from "./useShopStaffMembershipController";

const shopId = "shop-target" as Id<"shops">;
const organizationId = "organization-a" as Id<"organizations">;
const personId = "person-target" as Id<"organizationPeople">;
const anotherPersonId = "person-another" as Id<"organizationPeople">;
const staffId = "staff-target" as Id<"staffs">;
const anotherStaffId = "staff-another" as Id<"staffs">;

const data: ShopStaffMembershipData = {
  membershipFingerprint: "a".repeat(64),
  canWrite: true,
  writeDisabledReason: null,
  people: [
    {
      personId,
      name: "田中 花子",
      email: "hanako@example.com",
      isManager: false,
      isActiveManager: false,
      otherShopNames: [],
      isSelected: true,
      staffId,
      canChange: true,
      changeDisabledReason: null,
    },
  ],
};

const input: ShopStaffMembershipChangeInput = {
  shopId,
  desiredActivePersonIds: [],
  expectedMembershipFingerprint: data.membershipFingerprint,
  removalPreviews: [
    {
      personId,
      staffId,
      assignmentCount: 2,
      fingerprint: "b".repeat(64),
    },
  ],
  requestId: "00000000-0000-4000-8000-000000000001",
};
const mutationInput = { ...input, expectedOrganizationId: organizationId };
const useShopStaffMembershipController = (
  options: Omit<Parameters<typeof useRawShopStaffMembershipController>[0], "expectedOrganizationId">,
) => useRawShopStaffMembershipController({ ...options, expectedOrganizationId: organizationId });

beforeEach(() => {
  mocks.useQuery.mockReset();
  mocks.useMutation.mockReset();
  mocks.mutation.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.membershipData = data;
  mocks.previewData = undefined;
  mocks.useQuery.mockImplementation((query: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    if (query === mocks.membershipQueryRef) return mocks.membershipData;
    if (query === mocks.previewQueryRef) return mocks.previewData;
    throw new Error("Unexpected query");
  });
  mocks.useMutation.mockReturnValue(mocks.mutation);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("店舗詳細の所属スタッフ変更", () => {
  it("閉じている間はqueryをskipし、開くと表示中の店舗IDを明示して取得する", () => {
    const { rerender } = renderHook(
      ({ isOpen }) => useShopStaffMembershipController({ shopId, isOpen, onSucceeded: vi.fn() }),
      { initialProps: { isOpen: false } },
    );

    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.membershipQueryRef, "skip");
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.previewQueryRef, "skip");

    rerender({ isOpen: true });

    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.membershipQueryRef, {
      shopId: "shop-target",
      expectedOrganizationId: organizationId,
    });
    expect(mocks.useQuery).toHaveBeenLastCalledWith(mocks.previewQueryRef, "skip");
  });

  it("解除対象だけを表示中の店舗IDとsnapshot fingerprintでpreviewする", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_786_406_400_000);
    const { result } = renderHook(() =>
      useShopStaffMembershipController({ shopId, isOpen: true, onSucceeded: vi.fn() }),
    );

    act(() => {
      expect(result.current.ensureRemovalPreview([personId], data.membershipFingerprint)).toBe(true);
    });

    await waitFor(() =>
      expect(mocks.useQuery).toHaveBeenCalledWith(mocks.previewQueryRef, {
        shopId: "shop-target",
        personIds: [personId],
        expectedMembershipFingerprint: data.membershipFingerprint,
        expectedOrganizationId: organizationId,
        now: 1_786_406_400_000,
      }),
    );
    expect(result.current.removalPreviewState).toEqual({
      kind: "loading",
      key: buildShopStaffRemovalPreviewKey([personId], data.membershipFingerprint),
    });
  });

  it("対象IDを正規化し、同じ対象集合のpreview要求を重複させない", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1_786_406_400_000).mockReturnValueOnce(1_786_406_500_000);
    const { result } = renderHook(() =>
      useShopStaffMembershipController({ shopId, isOpen: true, onSucceeded: vi.fn() }),
    );

    act(() => {
      expect(result.current.ensureRemovalPreview([personId, anotherPersonId], data.membershipFingerprint)).toBe(true);
    });
    await waitFor(() =>
      expect(mocks.useQuery).toHaveBeenCalledWith(mocks.previewQueryRef, {
        shopId: "shop-target",
        personIds: [anotherPersonId, personId],
        expectedMembershipFingerprint: data.membershipFingerprint,
        expectedOrganizationId: organizationId,
        now: 1_786_406_400_000,
      }),
    );
    const previewQueryCallCount = mocks.useQuery.mock.calls.filter(
      ([query, args]) => query === mocks.previewQueryRef && args !== "skip",
    ).length;

    act(() => {
      expect(result.current.ensureRemovalPreview([anotherPersonId, personId], data.membershipFingerprint)).toBe(true);
    });

    expect(
      mocks.useQuery.mock.calls.filter(([query, args]) => query === mocks.previewQueryRef && args !== "skip"),
    ).toHaveLength(previewQueryCallCount);
  });

  it("解除対象が変わると古いready previewを即座に無効化する", async () => {
    const firstReadyPreview = {
      kind: "ready" as const,
      removals: input.removalPreviews,
      totalAssignmentCount: 2,
    };
    const secondReadyPreview = {
      kind: "ready" as const,
      removals: [
        {
          personId: anotherPersonId,
          staffId: anotherStaffId,
          assignmentCount: 1,
          fingerprint: "c".repeat(64),
        },
      ],
      totalAssignmentCount: 1,
    };
    const { result, rerender } = renderHook(
      ({ version }) => {
        void version;
        return useShopStaffMembershipController({ shopId, isOpen: true, onSucceeded: vi.fn() });
      },
      { initialProps: { version: 1 } },
    );

    act(() => {
      result.current.ensureRemovalPreview([personId], data.membershipFingerprint);
    });
    mocks.previewData = firstReadyPreview;
    rerender({ version: 2 });
    await waitFor(() =>
      expect(result.current.removalPreviewState).toEqual({
        kind: "ready",
        key: buildShopStaffRemovalPreviewKey([personId], data.membershipFingerprint),
        preview: firstReadyPreview,
      }),
    );

    mocks.previewData = undefined;
    act(() => {
      result.current.ensureRemovalPreview([anotherPersonId], data.membershipFingerprint);
    });
    await waitFor(() =>
      expect(result.current.removalPreviewState).toEqual({
        kind: "loading",
        key: buildShopStaffRemovalPreviewKey([anotherPersonId], data.membershipFingerprint),
      }),
    );

    mocks.previewData = secondReadyPreview;
    rerender({ version: 3 });
    await waitFor(() =>
      expect(result.current.removalPreviewState).toEqual({
        kind: "ready",
        key: buildShopStaffRemovalPreviewKey([anotherPersonId], data.membershipFingerprint),
        preview: secondReadyPreview,
      }),
    );
  });

  it("previewがstaleの場合は現在のkeyに結び付けて再読み込みを案内する", async () => {
    const { result, rerender } = renderHook(
      ({ version }) => {
        void version;
        return useShopStaffMembershipController({ shopId, isOpen: true, onSucceeded: vi.fn() });
      },
      { initialProps: { version: 1 } },
    );

    act(() => {
      result.current.ensureRemovalPreview([personId], data.membershipFingerprint);
    });
    mocks.previewData = { kind: "stale" };
    rerender({ version: 2 });

    await waitFor(() => {
      expect(result.current.removalPreviewState).toEqual({
        kind: "stale",
        key: buildShopStaffRemovalPreviewKey([personId], data.membershipFingerprint),
        preview: { kind: "stale" },
      });
      expect(result.current.errorMessage).toContain("画面を再読み込みして");
    });
  });

  it("所属変更前に古いpreview購読を解除し、処理中は送信対象のready previewだけを保持する", async () => {
    let resolveMutation: (() => void) | undefined;
    mocks.previewData = {
      kind: "ready",
      removals: input.removalPreviews,
      totalAssignmentCount: 2,
    };
    mocks.mutation.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveMutation = resolve;
      }),
    );
    const { result } = renderHook(() =>
      useShopStaffMembershipController({ shopId, isOpen: true, onSucceeded: vi.fn() }),
    );

    act(() => {
      expect(result.current.ensureRemovalPreview([personId], data.membershipFingerprint)).toBe(true);
    });
    await waitFor(() =>
      expect(result.current.removalPreviewState).toEqual({
        kind: "ready",
        key: buildShopStaffRemovalPreviewKey([personId], data.membershipFingerprint),
        preview: mocks.previewData,
      }),
    );

    let submission: Promise<ShopStaffMembershipSubmitResult | undefined> | undefined;
    act(() => {
      submission = result.current.submitChange(input);
    });

    await waitFor(() => expect(mocks.useQuery).toHaveBeenLastCalledWith(mocks.previewQueryRef, "skip"));
    expect(result.current.removalPreviewState).toEqual({
      kind: "ready",
      key: buildShopStaffRemovalPreviewKey([personId], data.membershipFingerprint),
      preview: mocks.previewData,
    });
    await act(async () => resolveMutation?.());
    await expect(submission).resolves.toBe("succeeded");
  });

  it("一つのintentを一度だけmutationへ渡し、成功時にToastとcloseを実行する", async () => {
    let resolveMutation: (() => void) | undefined;
    mocks.mutation.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveMutation = resolve;
      }),
    );
    const onSucceeded = vi.fn();
    const { result } = renderHook(() => useShopStaffMembershipController({ shopId, isOpen: true, onSucceeded }));
    let firstResult: Promise<ShopStaffMembershipSubmitResult | undefined> | undefined;
    let secondResult: Promise<ShopStaffMembershipSubmitResult | undefined> | undefined;

    act(() => {
      firstResult = result.current.submitChange(input);
      secondResult = result.current.submitChange({ ...input, requestId: "second-request" });
    });

    await waitFor(() => expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith(mutationInput));
    await expect(secondResult).resolves.toBeUndefined();
    await act(async () => resolveMutation?.());
    await expect(firstResult).resolves.toBe("succeeded");
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "所属スタッフを変更しました" });
    expect(onSucceeded).toHaveBeenCalledOnce();
  });

  it("結果が不明な要求は所属snapshotが更新されても同じinputで再試行する", async () => {
    mocks.mutation.mockRejectedValueOnce(new Error("network error")).mockResolvedValueOnce(null);
    const onSucceeded = vi.fn();
    const { result, rerender } = renderHook(
      ({ version }) => {
        void version;
        return useShopStaffMembershipController({ shopId, isOpen: true, onSucceeded });
      },
      { initialProps: { version: 1 } },
    );

    await act(async () => {
      await expect(result.current.submitChange(input)).resolves.toBe("unknown");
    });
    mocks.membershipData = { ...data, membershipFingerprint: "c".repeat(64) };
    rerender({ version: 2 });
    await act(async () => {
      await expect(result.current.submitChange(input)).resolves.toBe("succeeded");
    });

    expect(mocks.mutation).toHaveBeenCalledTimes(2);
    expect(mocks.mutation).toHaveBeenNthCalledWith(1, mutationInput);
    expect(mocks.mutation).toHaveBeenNthCalledWith(2, mutationInput);
    expect(onSucceeded).toHaveBeenCalledOnce();
  });

  it("未送信intentのsnapshotが古い場合はmutationを開始しない", async () => {
    mocks.membershipData = { ...data, membershipFingerprint: "d".repeat(64) };
    const { result } = renderHook(() =>
      useShopStaffMembershipController({ shopId, isOpen: true, onSucceeded: vi.fn() }),
    );

    await act(async () => {
      await expect(result.current.submitChange(input)).resolves.toBe("rejected");
    });

    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toContain("画面を再読み込みして");
  });

  it("処理中に画面から離れた場合は完了Toastとcloseを実行しない", async () => {
    let resolveMutation: (() => void) | undefined;
    mocks.mutation.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveMutation = resolve;
      }),
    );
    const onSucceeded = vi.fn();
    const { result, unmount } = renderHook(() =>
      useShopStaffMembershipController({ shopId, isOpen: true, onSucceeded }),
    );
    let submission: Promise<ShopStaffMembershipSubmitResult | undefined> | undefined;

    act(() => {
      submission = result.current.submitChange(input);
    });
    await waitFor(() => expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith(mutationInput));
    unmount();
    await act(async () => resolveMutation?.());

    await expect(submission).resolves.toBe("succeeded");
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
    expect(onSucceeded).not.toHaveBeenCalled();
  });

  it("確定的なConvex拒否は結果不明として保持せず、古い同一inputを再送しない", async () => {
    mocks.mutation.mockRejectedValueOnce(new ConvexError("変更操作が続いています。"));
    const { result, rerender } = renderHook(
      ({ version }) => {
        void version;
        return useShopStaffMembershipController({ shopId, isOpen: true, onSucceeded: vi.fn() });
      },
      { initialProps: { version: 1 } },
    );

    await act(async () => {
      await expect(result.current.submitChange(input)).resolves.toBe("rejected");
    });
    expect(result.current.errorMessage).toBe("変更操作が続いています。");
    mocks.membershipData = { ...data, membershipFingerprint: "d".repeat(64) };
    rerender({ version: 2 });
    await act(async () => {
      await expect(result.current.submitChange(input)).resolves.toBe("rejected");
    });

    expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith(mutationInput);
    expect(result.current.errorMessage).toContain("画面を再読み込みして");
  });

  it("確定拒否の案内は同じ選択の自動previewを開始しても消さない", async () => {
    mocks.mutation.mockRejectedValueOnce(new ConvexError("変更操作が続いています。"));
    const { result } = renderHook(() =>
      useShopStaffMembershipController({ shopId, isOpen: true, onSucceeded: vi.fn() }),
    );

    await act(async () => {
      await expect(result.current.submitChange(input)).resolves.toBe("rejected");
    });
    expect(result.current.errorMessage).toBe("変更操作が続いています。");

    act(() => {
      expect(result.current.ensureRemovalPreview([personId], data.membershipFingerprint)).toBe(true);
    });

    expect(result.current.errorMessage).toBe("変更操作が続いています。");
  });

  it("結果不明の再試行が確定拒否された後は同一inputの例外扱いを解除する", async () => {
    mocks.mutation
      .mockRejectedValueOnce(new Error("network error"))
      .mockRejectedValueOnce(new ConvexError("変更操作が続いています。"));
    const { result, rerender } = renderHook(
      ({ version }) => {
        void version;
        return useShopStaffMembershipController({ shopId, isOpen: true, onSucceeded: vi.fn() });
      },
      { initialProps: { version: 1 } },
    );

    await act(async () => {
      await expect(result.current.submitChange(input)).resolves.toBe("unknown");
      await expect(result.current.submitChange(input)).resolves.toBe("rejected");
    });
    mocks.membershipData = { ...data, membershipFingerprint: "e".repeat(64) };
    rerender({ version: 2 });
    await act(async () => {
      await expect(result.current.submitChange(input)).resolves.toBe("rejected");
    });

    expect(mocks.mutation).toHaveBeenCalledTimes(2);
    expect(result.current.errorMessage).toContain("画面を再読み込みして");
  });
});
