// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserDetailData } from "./types";

const mocks = vi.hoisted(() => ({
  generateLinkTokenRef: Symbol("generateLinkToken"),
  sendInviteRef: Symbol("sendInvite"),
  disconnectRef: Symbol("disconnectOrganizationPersonLine"),
  useMutation: vi.fn(),
  generateLinkToken: vi.fn(),
  sendInvite: vi.fn(),
  disconnect: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    line: {
      mutations: {
        generateLinkToken: mocks.generateLinkTokenRef,
        sendInvite: mocks.sendInviteRef,
        disconnectOrganizationPersonLine: mocks.disconnectRef,
      },
    },
  },
}));

vi.mock("convex/react", () => ({ useMutation: mocks.useMutation }));
vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

import { useUserLineActions } from "./useUserLineActions";

const personId = "person-target" as Id<"organizationPeople">;
const sourceStaffId = "staff-source" as Id<"staffs">;
const sourceShopId = "shop-source" as Id<"shops">;
const actionShopId = "shop-action" as Id<"shops">;
const organizationId = "organization-a" as Id<"organizations">;

const data = {
  person: { id: personId },
  line: {
    status: "linked_following",
    actionShopId,
    sourceStaffId,
    sourceShopId,
    canLink: true,
    canDisconnect: true,
  },
} as unknown as UserDetailData;

beforeEach(() => {
  mocks.useMutation.mockReset();
  mocks.generateLinkToken.mockReset();
  mocks.sendInvite.mockReset();
  mocks.disconnect.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.useMutation.mockImplementation((reference: unknown) => {
    if (reference === mocks.generateLinkTokenRef) return mocks.generateLinkToken;
    if (reference === mocks.sendInviteRef) return mocks.sendInvite;
    if (reference === mocks.disconnectRef) return mocks.disconnect;
    throw new Error("Unexpected mutation reference");
  });
  mocks.generateLinkToken.mockResolvedValue({ authorizeUrl: "https://line.example/authorize" });
  mocks.sendInvite.mockResolvedValue({ scheduled: true });
  mocks.disconnect.mockResolvedValue(null);
});

describe("useUserLineActions", () => {
  it("app導線では全mutationにexpected organizationを渡す", async () => {
    const { result } = renderHook(() => useUserLineActions({ data, expectedOrganizationId: organizationId }));

    await act(async () => {
      await result.current.onShowQr();
      await result.current.onSendInvite();
      await result.current.onDisconnect("disconnect-request");
    });

    expect(mocks.generateLinkToken).toHaveBeenCalledExactlyOnceWith({
      shopId: sourceShopId,
      staffId: sourceStaffId,
      expectedOrganizationId: organizationId,
    });
    expect(mocks.sendInvite).toHaveBeenCalledExactlyOnceWith({
      shopId: sourceShopId,
      staffId: sourceStaffId,
      expectedOrganizationId: organizationId,
    });
    expect(mocks.disconnect).toHaveBeenCalledExactlyOnceWith({
      shopId: actionShopId,
      organizationPersonId: personId,
      requestId: "disconnect-request",
      expectedOrganizationId: organizationId,
    });
  });

  it("連携元membershipをtokenとメールへ渡し、明示解除は組織人物単位で実行する", async () => {
    const { result } = renderHook(() => useUserLineActions({ data }));

    await act(async () => {
      await result.current.onShowQr();
    });
    expect(result.current.authorizeUrl).toBe("https://line.example/authorize");

    await act(async () => {
      await result.current.onSendInvite();
      await result.current.onDisconnect("disconnect-request");
    });

    expect(mocks.generateLinkToken).toHaveBeenCalledExactlyOnceWith({ shopId: sourceShopId, staffId: sourceStaffId });
    expect(mocks.sendInvite).toHaveBeenCalledExactlyOnceWith({ shopId: sourceShopId, staffId: sourceStaffId });
    expect(mocks.disconnect).toHaveBeenCalledExactlyOnceWith({
      shopId: actionShopId,
      organizationPersonId: personId,
      requestId: "disconnect-request",
    });
    expect(result.current.authorizeUrl).toBeNull();
    expect(mocks.showSuccessToast).toHaveBeenCalledTimes(2);
  });

  it("Capabilityまたは連携元membershipがなければmutationを開始しない", async () => {
    const unavailableData = {
      ...data,
      line: {
        ...data.line,
        sourceStaffId: null,
        sourceShopId: null,
        canLink: false,
        canDisconnect: false,
      },
    } as UserDetailData;
    const { result } = renderHook(() => useUserLineActions({ data: unavailableData }));

    await act(async () => {
      await result.current.onShowQr();
      await result.current.onSendInvite();
      await result.current.onDisconnect("disconnect-request");
    });

    expect(mocks.generateLinkToken).not.toHaveBeenCalled();
    expect(mocks.sendInvite).not.toHaveBeenCalled();
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it("同じ操作を連続実行してもmutationは1回だけ開始する", async () => {
    let resolveInvite: (() => void) | undefined;
    mocks.sendInvite.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveInvite = resolve;
        }),
    );
    const { result } = renderHook(() => useUserLineActions({ data }));

    let first: Promise<unknown> = Promise.resolve();
    let second: Promise<unknown> = Promise.resolve();
    act(() => {
      first = result.current.onSendInvite();
      second = result.current.onSendInvite();
    });

    expect(mocks.sendInvite).toHaveBeenCalledExactlyOnceWith({ shopId: sourceShopId, staffId: sourceStaffId });
    await act(async () => {
      resolveInvite?.();
      await Promise.all([first, second]);
    });
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "LINE連携リンクをメールで送りました",
    });
  });

  it("mutation失敗を既存toastで通知し、QR表示状態を残さない", async () => {
    const tokenError = new Error("token failed");
    const inviteError = new Error("invite failed");
    const disconnectError = new Error("disconnect failed");
    mocks.generateLinkToken.mockRejectedValueOnce(tokenError);
    mocks.sendInvite.mockRejectedValueOnce(inviteError);
    mocks.disconnect.mockRejectedValueOnce(disconnectError);
    const { result } = renderHook(() => useUserLineActions({ data }));

    await act(async () => {
      await result.current.onShowQr();
      await result.current.onSendInvite();
      await result.current.onDisconnect("disconnect-request");
    });

    expect(result.current.authorizeUrl).toBeNull();
    expect(result.current.showQr).toBe(false);
    expect(mocks.showErrorToast).toHaveBeenNthCalledWith(1, tokenError);
    expect(mocks.showErrorToast).toHaveBeenNthCalledWith(2, inviteError);
    expect(mocks.showErrorToast).toHaveBeenNthCalledWith(3, disconnectError);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("対象人物が変わった後に完了したURLとtoastを現在画面へ反映しない", async () => {
    let resolveToken: ((value: { authorizeUrl: string }) => void) | undefined;
    mocks.generateLinkToken.mockImplementation(
      () =>
        new Promise<{ authorizeUrl: string }>((resolve) => {
          resolveToken = resolve;
        }),
    );
    const { result, rerender } = renderHook(({ currentData }) => useUserLineActions({ data: currentData }), {
      initialProps: { currentData: data },
    });

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.onShowQr();
    });
    rerender({
      currentData: {
        ...data,
        person: { ...data.person, id: "person-other" as Id<"organizationPeople"> },
      },
    });
    await act(async () => {
      resolveToken?.({ authorizeUrl: "https://line.example/stale" });
      await pending;
    });

    expect(result.current.authorizeUrl).toBeNull();
    expect(result.current.showQr).toBe(false);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });
});
