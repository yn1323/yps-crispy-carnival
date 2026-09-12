// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExportFixture } from "./fixtures";
import {
  channelName,
  createSnapshot,
  readStoredSnapshot,
  SNAPSHOT_LIFETIME_MS,
  sendSnapshot,
  storeSnapshot,
  TRANSFER_TIMEOUT_MS,
  validateSnapshot,
} from "./transfer";
import { useReceivedShiftExport } from "./useShiftExportTransfer";

const auth = vi.hoisted(() => ({ userId: "manager" as string | null }));
vi.mock("@clerk/react", () => ({ useAuth: () => auth }));
vi.mock("@/src/components/ui/toaster", () => ({ toaster: { create: vi.fn() } }));
class Channel {
  static channels = new Set<Channel>();
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(readonly name: string) {
    Channel.channels.add(this);
  }
  postMessage(value: unknown) {
    for (const target of Channel.channels) {
      if (target !== this && target.name === this.name) {
        const copy = structuredClone(value);
        queueMicrotask(() => {
          if (Channel.channels.has(target)) target.onmessage?.({ data: copy } as MessageEvent);
        });
      }
    }
  }
  close() {
    Channel.channels.delete(this);
  }
}
const scope = { userId: "manager", organizationId: "org", shopId: "shop", recruitmentId: "recruitment" };
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("BroadcastChannel", Channel);
  vi.spyOn(window, "open").mockReturnValue(null);
  sessionStorage.clear();
  history.replaceState(null, "", "/shifts/recruitment/export?org=org");
  auth.userId = "manager";
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Channel.channels.clear();
});
const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

describe("出力データの受け渡し", () => {
  it("準備完了まで送信せず、受領後は通信を閉じて元の変更から独立する", async () => {
    const fixture = createExportFixture();
    const snapshot = createSnapshot(fixture, scope);
    const failed = vi.fn();
    const finished = vi.fn();
    sendSnapshot(snapshot, failed, finished);
    fixture.assignments[0].endTime = "21:00";
    const receiver = new Channel(channelName(snapshot.transferId));
    const received = vi.fn();
    receiver.onmessage = ({ data }) => received(data);
    await flush();
    expect(received).not.toHaveBeenCalled();
    receiver.postMessage({ type: "ready", userId: "different-user", transferId: snapshot.transferId });
    await flush();
    expect(received).not.toHaveBeenCalled();
    receiver.postMessage({ type: "ready", userId: scope.userId, transferId: snapshot.transferId });
    await flush();
    expect(received).toHaveBeenCalledExactlyOnceWith({ type: "snapshot", snapshot });
    expect(received.mock.calls[0][0].snapshot.data.assignments[0].endTime).toBe("17:00");
    receiver.postMessage({ type: "received", userId: scope.userId, transferId: snapshot.transferId });
    await flush();
    expect(finished).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(TRANSFER_TIMEOUT_MS);
    expect(failed).not.toHaveBeenCalled();
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining(`#${snapshot.transferId}`),
      "_blank",
      "noopener,noreferrer",
    );
    receiver.close();
    expect(Channel.channels.size).toBe(0);
  });
  it("受信者が開けない場合は待機を終え、データを解放する", async () => {
    const fail = vi.fn();
    sendSnapshot(createSnapshot(createExportFixture(), scope), fail, vi.fn());
    await vi.advanceTimersByTimeAsync(TRANSFER_TIMEOUT_MS);
    expect(fail).toHaveBeenCalledTimes(1);
    expect(Channel.channels.size).toBe(0);
  });
  it("実際に受け取り、StrictModeでも保持し、元タブ終了後に保存データから復元する", async () => {
    const snapshot = createSnapshot(createExportFixture(), scope);
    history.replaceState(null, "", `#${snapshot.transferId}`);
    const cancel = sendSnapshot(snapshot, vi.fn(), vi.fn());
    const { result } = renderHook(() => useReceivedShiftExport(scope, true), { wrapper: StrictMode });
    await flush();
    expect(result.current?.snapshot?.data).toEqual(snapshot.data);
    expect(location.hash).toBe("");
    cancel();
    expect(readStoredSnapshot(scope)?.data).toEqual(snapshot.data);
    // reloadはReact unmountではない。別のhook起動でブラウザ内の保存データを読む境界を検証する。
    const restored = renderHook(() => useReceivedShiftExport(scope, true));
    expect(restored.result.current?.snapshot?.data).toEqual(snapshot.data);
  });
  it("連続した出力はそれぞれの内容を別のchannelで受信する", async () => {
    const first = createSnapshot(createExportFixture(), scope);
    const second = createSnapshot(createExportFixture({ assignments: [] }), scope);
    sendSnapshot(first, vi.fn(), vi.fn());
    sendSnapshot(second, vi.fn(), vi.fn());
    const received: unknown[] = [];
    const receiver = new Channel(channelName(second.transferId));
    receiver.onmessage = ({ data }) => received.push(data.snapshot.data.assignments);
    receiver.postMessage({ type: "ready", userId: scope.userId, transferId: second.transferId });
    await flush();
    expect(received).toEqual([[]]);
  });
  it.each(["userId", "organizationId", "shopId", "recruitmentId"] as const)("%sが違う保存データを復元しない", (key) => {
    storeSnapshot(createSnapshot(createExportFixture(), scope));
    expect(readStoredSnapshot({ ...scope, [key]: "other" })).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
  it("期限到来と権限喪失で表示内容・保存データを破棄する", async () => {
    storeSnapshot(createSnapshot(createExportFixture(), scope));
    const renderedSnapshots: unknown[] = [];
    const { result, rerender } = renderHook(
      ({ allowed }) => {
        const received = useReceivedShiftExport(scope, allowed);
        renderedSnapshots.push(received?.snapshot ?? null);
        return received;
      },
      { initialProps: { allowed: true } },
    );
    expect(result.current?.snapshot).toBeTruthy();
    rerender({ allowed: false });
    expect(result.current).toBeNull();
    expect(sessionStorage.length).toBe(0);
    renderedSnapshots.length = 0;
    rerender({ allowed: true });
    expect(renderedSnapshots.every((snapshot) => snapshot === null)).toBe(true);
    expect(result.current?.error).toBeTruthy();
    storeSnapshot(createSnapshot(createExportFixture(), scope));
    const expiry = renderHook(() => useReceivedShiftExport(scope, true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SNAPSHOT_LIFETIME_MS);
    });
    expect(expiry.result.current?.snapshot).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
  it("型・日付・スタッフ参照・重複を検証し、不正な帳票を作らない", () => {
    const snapshot = createSnapshot(createExportFixture(), scope);
    expect(() => validateSnapshot({ ...snapshot, version: 2 }, scope)).toThrow();
    expect(() => createSnapshot(createExportFixture({ staffs: [] }), scope)).toThrow();
    expect(() =>
      createSnapshot(createExportFixture({ staffs: [snapshot.data.staffs[0], snapshot.data.staffs[0]] }), scope),
    ).toThrow();
    expect(() =>
      createSnapshot(
        createExportFixture({ assignments: [{ ...snapshot.data.assignments[0], staffId: "missing" }] }),
        scope,
      ),
    ).toThrow();
  });
  it("storageを使えなくても受信済み内容はその場で出力できる", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    const snapshot = createSnapshot(createExportFixture(), scope);
    history.replaceState(null, "", `#${snapshot.transferId}`);
    sendSnapshot(snapshot, vi.fn(), vi.fn());
    const { result } = renderHook(() => useReceivedShiftExport(scope, true));
    await flush();
    expect(result.current?.snapshot?.data).toEqual(snapshot.data);
    expect(result.current?.storageAvailable).toBe(false);
  });
});
