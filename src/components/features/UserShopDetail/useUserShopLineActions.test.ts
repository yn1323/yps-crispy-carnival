// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserShopDetailMembership } from "./types";

const mocks = vi.hoisted(() => ({
  generateLinkTokenRef: Symbol("generateLinkToken"),
  sendInviteRef: Symbol("sendInvite"),
  useMutation: vi.fn(),
  generateLinkToken: vi.fn(),
  sendInvite: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    line: {
      mutations: {
        generateLinkToken: mocks.generateLinkTokenRef,
        sendInvite: mocks.sendInviteRef,
      },
    },
  },
}));

vi.mock("convex/react", () => ({ useMutation: mocks.useMutation }));
vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

import { useUserShopLineActions } from "./useUserShopLineActions";

const targetShopId = "shop-target" as Id<"shops">;
const staffId = "staff-target" as Id<"staffs">;
const membership = {
  shopId: targetShopId,
  staffId,
  line: { isLinked: false, isFollowing: false },
} as unknown as UserShopDetailMembership;

beforeEach(() => {
  mocks.useMutation.mockReset();
  mocks.generateLinkToken.mockReset();
  mocks.sendInvite.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.useMutation.mockImplementation((reference: unknown) => {
    if (reference === mocks.generateLinkTokenRef) return mocks.generateLinkToken;
    if (reference === mocks.sendInviteRef) return mocks.sendInvite;
    throw new Error("Unexpected mutation reference");
  });
  mocks.generateLinkToken.mockResolvedValue({ authorizeUrl: "https://line.example/authorize" });
  mocks.sendInvite.mockResolvedValue({ scheduled: true });
});

describe("useUserShopLineActions", () => {
  it("LINE連携URLの発行とメール送信の両方へpathのtargetShopIdを明示する", async () => {
    const { result } = renderHook(() => useUserShopLineActions({ targetShopId, membership, isReadOnly: false }));

    await act(async () => {
      await result.current.onShowQr();
    });
    await act(async () => {
      await result.current.onSendInvite();
    });

    expect(mocks.generateLinkToken).toHaveBeenCalledExactlyOnceWith({ shopId: targetShopId, staffId });
    expect(mocks.sendInvite).toHaveBeenCalledExactlyOnceWith({ shopId: targetShopId, staffId });
    expect(result.current.authorizeUrl).toBe("https://line.example/authorize");
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "LINE連携リンクをメールで送りました",
    });
  });

  it("membershipとpathの店舗が一致しなければ送信しない", async () => {
    const mismatchedShopId = "shop-other" as Id<"shops">;
    const { result } = renderHook(() =>
      useUserShopLineActions({ targetShopId: mismatchedShopId, membership, isReadOnly: false }),
    );

    await act(async () => {
      await result.current.onShowQr();
      await result.current.onSendInvite();
    });

    expect(mocks.generateLinkToken).not.toHaveBeenCalled();
    expect(mocks.sendInvite).not.toHaveBeenCalled();
  });
});
