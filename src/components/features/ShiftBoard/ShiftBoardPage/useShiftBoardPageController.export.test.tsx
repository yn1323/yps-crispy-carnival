// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftData } from "@/src/domains/shift/types";
import { ManagerShopScopeProvider } from "@/src/providers/ManagerShopScopeProvider";
import type { ShiftBoardData } from "../types";

const mocks = vi.hoisted(() => ({
  saveReference: Symbol("save"),
  confirmReference: Symbol("confirm"),
  save: vi.fn(),
  confirm: vi.fn(),
  toast: vi.fn(),
  blocker: { status: "idle", reset: vi.fn(), proceed: vi.fn() },
}));

vi.mock("@tanstack/react-router", () => ({ useBlocker: () => mocks.blocker }));
vi.mock("@/convex/_generated/api", () => ({
  api: {
    shiftBoard: {
      mutations: { saveShiftAssignments: mocks.saveReference, confirmRecruitment: mocks.confirmReference },
    },
  },
}));
vi.mock("@/src/hooks/useShopMutation", () => ({
  useShopMutation: (reference: unknown) => (reference === mocks.saveReference ? mocks.save : mocks.confirm),
}));
vi.mock("@/src/components/shared/feedback", () => ({ showErrorToast: vi.fn(), showSuccessToast: vi.fn() }));
vi.mock("@/src/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }));

import { useShiftBoardPageController } from "./useShiftBoardPageController";

const recruitmentId = "recruitment-a" as Id<"recruitments">;
const staffId = "staff-a" as Id<"staffs">;
const positionId = "position-a" as Id<"positions">;
const data: ShiftBoardData = {
  shopId: "shop-a" as Id<"shops">,
  canWriteBusinessData: true,
  businessWriteBlockReason: null,
  recruitment: {
    _id: recruitmentId,
    periodStart: "2099-01-20",
    periodEnd: "2099-01-20",
    deadline: "2099-01-17",
    shopClosedDates: [],
    status: "open",
    confirmedAt: null,
    reminderScheduledAt: null,
    lastReminderSentAt: null,
    draftSavedAt: 1,
  },
  submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  staffs: [{ _id: staffId, name: "出力スタッフ", isSubmitted: true, wasSubmittedAtDraft: true }],
  requestedSlots: [],
  requestedDates: [],
  shiftAssignments: [{ staffId, date: "2099-01-20", startTime: "09:00", endTime: "17:00", positionId }],
  positions: [{ _id: positionId, name: "シフト", color: "#3b82f6", isDefault: true }],
  timeRange: { start: 9, end: 22, unit: 30 },
};

function Scope({ children }: { children: ReactNode }) {
  return (
    <ManagerShopScopeProvider shopId={data.shopId} expectedOrganizationId="verified-organization">
      {children}
    </ManagerShopScopeProvider>
  );
}

function changedShifts(shifts: ShiftData[]): ShiftData[] {
  return shifts.map((shift) => ({
    ...shift,
    positions: shift.positions.map((position) => ({ ...position, end: "18:00" })),
  }));
}

function renderInitialized(currentData: ShiftBoardData = data) {
  const hook = renderHook(() => useShiftBoardPageController(currentData, recruitmentId), { wrapper: Scope });
  act(() => hook.result.current.intents.onShiftsChange(hook.result.current.viewModel.shiftForm.initialShifts));
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue(null);
  mocks.confirm.mockResolvedValue(null);
  vi.spyOn(window, "open").mockReturnValue(null);
});

afterEach(() => vi.restoreAllMocks());

describe("募集条件の変更検知", () => {
  it("保存・確定には画面を開いた時点の版を送る", async () => {
    const versioned = { ...data, recruitment: { ...data.recruitment, editVersion: 3 } };
    const { result } = renderInitialized(versioned);
    await act(async () => result.current.intents.onConfirmDialogSubmit());
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ expectedEditVersion: 3 }));
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ expectedEditVersion: 3 }));
  });

  it("入力中のquery更新では版を追従せず、保存・確定を止めて再読み込みを案内する", async () => {
    const { result, rerender } = renderHook(({ current }) => useShiftBoardPageController(current, recruitmentId), {
      wrapper: Scope,
      initialProps: { current: data },
    });
    act(() => result.current.intents.onShiftsChange(result.current.viewModel.shiftForm.initialShifts));
    rerender({ current: { ...data, recruitment: { ...data.recruitment, editVersion: 1, periodEnd: "2099-01-21" } } });
    expect(result.current.viewModel.isRecruitmentChanged).toBe(true);
    await act(async () => {
      result.current.intents.onSaveDraft();
      result.current.intents.onConfirmDialogSubmit();
    });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});

describe("シフトボードからの出力", () => {
  it("保存内容を検証済みの組織付きURLで別タブへ開き、保存や通知を行わない", () => {
    const { result } = renderInitialized();

    act(() => result.current.intents.onOpenExport());

    expect(window.open).toHaveBeenCalledExactlyOnceWith(
      "/shifts/recruitment-a/export?org=verified-organization",
      "_blank",
      "noopener,noreferrer",
    );
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("クリック直前の未保存変更を検出し、保存を促して出力を止める", () => {
    const { result } = renderInitialized();

    act(() => {
      result.current.intents.onShiftsChange(changedShifts(result.current.viewModel.shiftForm.initialShifts));
      result.current.intents.onOpenExport();
    });

    expect(window.open).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({ title: "変更を保存してから出力してください", type: "info" });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("変更して元に戻した場合は未保存扱いにしない", () => {
    const { result } = renderInitialized();
    const initial = result.current.viewModel.shiftForm.initialShifts;

    act(() => {
      result.current.intents.onShiftsChange(changedShifts(initial));
      result.current.intents.onShiftsChange(structuredClone(initial));
      result.current.intents.onOpenExport();
    });

    expect(window.open).toHaveBeenCalledTimes(1);
  });

  it("フォーム初期化前の一時的な空配列では出力しない", () => {
    const { result } = renderHook(() => useShiftBoardPageController(data, recruitmentId), { wrapper: Scope });

    act(() => {
      result.current.intents.onShiftsChange([]);
      result.current.intents.onOpenExport();
    });

    expect(window.open).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "シフト表の読み込みが完了してから出力してください",
      type: "info",
    });
  });

  it("保存開始と同じイベント内の出力も止め、保存後の明示操作で開く", async () => {
    let completeSave = () => {};
    mocks.save.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          completeSave = resolve;
        }),
    );
    const { result } = renderInitialized();

    act(() => {
      result.current.intents.onShiftsChange(changedShifts(result.current.viewModel.shiftForm.initialShifts));
      result.current.intents.onSaveDraft();
      result.current.intents.onOpenExport();
    });

    expect(window.open).not.toHaveBeenCalled();
    expect(result.current.viewModel.exportAction?.isDisabled).toBe(true);
    await act(async () => completeSave());
    expect(window.open).not.toHaveBeenCalled();

    act(() => result.current.intents.onOpenExport());
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("保存が完了しても確定処理中は出力しない", async () => {
    let completeConfirm = () => {};
    mocks.confirm.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          completeConfirm = resolve;
        }),
    );
    const { result } = renderInitialized();

    await act(async () => {
      result.current.intents.onConfirmDialogSubmit();
    });
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    act(() => result.current.intents.onOpenExport());
    expect(window.open).not.toHaveBeenCalled();
    expect(result.current.viewModel.exportAction?.isDisabled).toBe(true);
    await act(async () => completeConfirm());
  });

  it("編集制限中や期間終了後も保存内容の出力を許可する", () => {
    const { result } = renderInitialized({
      ...data,
      canWriteBusinessData: false,
      businessWriteBlockReason: "usageLimitExceeded",
      recruitment: { ...data.recruitment, periodStart: "2020-01-20", periodEnd: "2020-01-20" },
    });

    act(() => result.current.intents.onOpenExport());

    expect(window.open).toHaveBeenCalledTimes(1);
    expect(result.current.viewModel.exportAction?.isDisabled).toBe(false);
  });

  it("組織・店舗scopeがない利用箇所には出力操作を公開しない", () => {
    const { result } = renderHook(() => useShiftBoardPageController(data, recruitmentId));

    act(() => result.current.intents.onOpenExport());

    expect(result.current.viewModel.exportAction).toBeNull();
    expect(window.open).not.toHaveBeenCalled();
  });
});
