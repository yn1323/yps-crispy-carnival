// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftSetupData } from "./types";

const mocks = vi.hoisted(() => ({
  savePositions: vi.fn(),
  saveDayTemplates: vi.fn(),
  saveBreakRule: vi.fn(),
  saveStaffShiftProfiles: vi.fn(),
  suggestShiftSetup: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  toasterCreate: vi.fn(),
  historyBack: vi.fn(),
  blockerOptions: null as null | { shouldBlockFn: () => boolean; enableBeforeUnload: () => boolean },
  blocker: { status: "idle" as "idle" | "blocked", proceed: vi.fn(), reset: vi.fn() },
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    shiftSetup: {
      mutations: {
        savePositions: "savePositions",
        saveDayTemplates: "saveDayTemplates",
        saveBreakRule: "saveBreakRule",
        saveStaffShiftProfiles: "saveStaffShiftProfiles",
      },
      actions: { suggestShiftSetup: "suggestShiftSetup" },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: "savePositions" | "saveDayTemplates" | "saveBreakRule" | "saveStaffShiftProfiles") =>
    mocks[reference],
  useAction: () => mocks.suggestShiftSetup,
}));

vi.mock("@tanstack/react-router", () => ({
  useBlocker: (options: { shouldBlockFn: () => boolean; enableBeforeUnload: () => boolean }) => {
    mocks.blockerOptions = options;
    return mocks.blocker;
  },
  useRouter: () => ({ history: { back: mocks.historyBack } }),
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

vi.mock("@/src/components/ui/toaster", () => ({ toaster: { create: mocks.toasterCreate } }));

import { useShiftSetupController } from "./useShiftSetupController";

const shopId = "shop-target" as Id<"shops">;
const organizationId = "organization-a" as Id<"organizations">;
const scope = { shopId, expectedOrganizationId: organizationId };
const hall = "position-hall" as Id<"positions">;
const kitchen = "position-kitchen" as Id<"positions">;
const templateId = "template-weekday" as Id<"shiftDayTemplates">;
const staffA = "staff-a" as Id<"staffs">;
const staffB = "staff-b" as Id<"staffs">;

const setup: ShiftSetupData = {
  shopName: "新宿店",
  submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  regularClosedDays: ["wed"],
  canWriteBusinessData: true,
  businessWriteBlockReason: null,
  positions: [
    { _id: hall, name: "ホール", color: "#3b82f6", isDefault: true },
    { _id: kitchen, name: "キッチン", color: "#c2410c", isDefault: false },
  ],
  dayTemplates: [
    {
      _id: templateId,
      name: "平日",
      weekdays: ["mon", "tue"],
      slots: [
        { key: { kind: "time", startTime: "09:00", endTime: "22:00" }, requirements: [{ positionId: hall, count: 2 }] },
      ],
    },
  ],
  breakRule: null,
  staffs: [
    { _id: staffA, name: "佐藤", unavailablePositionIds: [], skillLevel: "standard" },
    { _id: staffB, name: "鈴木", unavailablePositionIds: [], skillLevel: "standard" },
  ],
  assistAvailable: true,
};

const hallCell = { templateRowKey: templateId, slotRowKey: "time:09:00-22:00", positionId: hall };

function renderController(initialSetup: ShiftSetupData = setup) {
  return renderHook(({ current }) => useShiftSetupController({ shopId, organizationId, setup: current }), {
    initialProps: { current: initialSetup },
  });
}

beforeEach(() => {
  for (const mock of [
    mocks.savePositions,
    mocks.saveDayTemplates,
    mocks.saveBreakRule,
    mocks.saveStaffShiftProfiles,
    mocks.suggestShiftSetup,
    mocks.showErrorToast,
    mocks.showSuccessToast,
    mocks.toasterCreate,
    mocks.historyBack,
    mocks.blocker.proceed,
    mocks.blocker.reset,
  ]) {
    mock.mockReset();
  }
  mocks.blocker.status = "idle";
  mocks.blockerOptions = null;
});

describe("必要人数とスタッフの保存", () => {
  it("人数を変えて保存すると、対象店舗とexpected organizationですべての型を送る", async () => {
    mocks.saveDayTemplates.mockResolvedValue(null);
    const { result } = renderController();

    act(() => result.current.intents.onChangeRequiredCount(hallCell, 1));
    act(() => result.current.intents.onChangeRequiredCount({ ...hallCell, positionId: kitchen }, 1));
    expect(result.current.pendingSections).toEqual(["dayTemplates"]);

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.saveDayTemplates).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      templates: [
        {
          id: templateId,
          name: "平日",
          weekdays: ["mon", "tue"],
          slots: [
            {
              key: { kind: "time", startTime: "09:00", endTime: "22:00" },
              requirements: [
                { positionId: hall, count: 3 },
                { positionId: kitchen, count: 1 },
              ],
            },
          ],
        },
      ],
    });
    expect(mocks.saveStaffShiftProfiles).not.toHaveBeenCalled();
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "必要人数の設定を保存しました" });
    expect(result.current.pendingSections).toEqual([]);
  });

  it("変えたスタッフだけを、外したポジションと熟練度で送る", async () => {
    mocks.saveStaffShiftProfiles.mockResolvedValue(null);
    const { result } = renderController();

    act(() => result.current.intents.onToggleStaffPosition(staffA, kitchen));
    act(() => result.current.intents.onChangeStaffSkillLevel(staffA, "newcomer"));
    // 変えてから元の値へ戻したスタッフは、変更に数えない。
    act(() => result.current.intents.onChangeStaffSkillLevel(staffB, "lead"));
    act(() => result.current.intents.onChangeStaffSkillLevel(staffB, "standard"));
    expect(result.current.pendingSections).toEqual(["staffs"]);
    expect(result.current.staffProfiles[staffA]).toEqual({ unavailablePositionIds: [kitchen], skillLevel: "newcomer" });

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.saveStaffShiftProfiles).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      profiles: [{ staffId: staffA, unavailablePositionIds: [kitchen], skillLevel: "newcomer" }],
    });
    expect(mocks.saveDayTemplates).not.toHaveBeenCalled();
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "スタッフの設定を保存しました" });
  });

  it("最後に残ったポジションは外れない", () => {
    const { result } = renderController();

    act(() => result.current.intents.onToggleStaffPosition(staffA, kitchen));
    act(() => result.current.intents.onToggleStaffPosition(staffA, hall));

    expect(result.current.staffProfiles[staffA].unavailablePositionIds).toEqual([kitchen]);
  });

  it("両方に変更があれば両方を保存し、スタッフの保存に失敗したら保存できた分だけを伝える", async () => {
    const error = new Error("network error");
    mocks.saveDayTemplates.mockResolvedValue(null);
    mocks.saveStaffShiftProfiles.mockRejectedValue(error);
    const { result } = renderController();

    act(() => result.current.intents.onChangeRequiredCount(hallCell, 1));
    act(() => result.current.intents.onChangeStaffSkillLevel(staffA, "lead"));
    expect(result.current.pendingSections).toEqual(["dayTemplates", "staffs"]);

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.saveDayTemplates).toHaveBeenCalledTimes(1);
    expect(mocks.saveStaffShiftProfiles).toHaveBeenCalledTimes(1);
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "必要人数の設定を保存しました" });
    // 保存できなかったスタッフの変更は、編集中の値として残る。
    expect(result.current.staffProfiles[staffA].skillLevel).toBe("lead");
  });

  it("人数を元の値へ戻すと、保存していない変更はなくなる", () => {
    const { result } = renderController();

    act(() => result.current.intents.onChangeRequiredCount(hallCell, 1));
    act(() => result.current.intents.onChangeRequiredCount(hallCell, -1));

    expect(result.current.pendingSections).toEqual([]);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(false);
  });

  it("元に戻すと、必要人数とスタッフの編集中の値を捨てる", () => {
    const { result } = renderController();

    act(() => result.current.intents.onChangeRequiredCount(hallCell, 1));
    act(() => result.current.intents.onChangeStaffSkillLevel(staffA, "lead"));
    act(() => result.current.intents.onResetChanges());

    expect(result.current.pendingSections).toEqual([]);
    expect(result.current.dayTemplates.drafts[0].slots[0].counts).toEqual({ [hall]: 2 });
    expect(result.current.staffProfiles[staffA].skillLevel).toBe("standard");
  });

  it("名前が空の型があれば保存せず、その型に誤りを出す", async () => {
    const { result } = renderController();

    act(() => result.current.intents.onRenameDayTemplate(templateId, ""));
    // 入力の途中では誤りを出さない。
    expect(result.current.dayTemplates.issueMessages).toEqual({});

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.saveDayTemplates).not.toHaveBeenCalled();
    expect(result.current.dayTemplates.issueMessages).toEqual({ [templateId]: "型の名前を入力してください" });
    expect(mocks.toasterCreate).toHaveBeenCalledExactlyOnceWith({ title: "型の名前を入力してください", type: "error" });
    expect(result.current.pendingSections).toEqual(["dayTemplates"]);
  });

  it("時間帯の重なりは、保存を試す前から誤りとして出す", () => {
    const { result } = renderController();

    act(() => result.current.intents.onAddTimeSlot(templateId));
    const [first, second] = result.current.dayTemplates.drafts[0].slots;
    expect([first.key, second.key]).toEqual([
      { kind: "time", startTime: "09:00", endTime: "16:00" },
      { kind: "time", startTime: "16:00", endTime: "22:00" },
    ]);

    act(() =>
      result.current.intents.onChangeTimeSlotRange(
        { templateRowKey: templateId, slotRowKey: second.rowKey },
        { startTime: "15:00" },
      ),
    );

    expect(result.current.dayTemplates.issueMessages).toEqual({ [templateId]: "時間帯が重なっています" });
  });

  it("短時間の連続保存は最初の一件だけを実行する", async () => {
    let resolveMutation: (() => void) | undefined;
    mocks.saveDayTemplates.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMutation = () => resolve(null);
        }),
    );
    const { result } = renderController();
    act(() => result.current.intents.onChangeRequiredCount(hallCell, 1));

    act(() => {
      result.current.intents.onSaveChanges();
      result.current.intents.onSaveChanges();
    });

    await waitFor(() => expect(mocks.saveDayTemplates).toHaveBeenCalledTimes(1));
    expect(result.current.isSaving).toBe(true);
    await act(async () => resolveMutation?.());
    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(mocks.saveDayTemplates).toHaveBeenCalledTimes(1);
  });
});

describe("型の追加", () => {
  it("足した型は、まだ割り当てていない営業日と直前の型の人数を初期値に持ち、idなしで保存される", async () => {
    mocks.saveDayTemplates.mockResolvedValue(null);
    const { result } = renderController();

    act(() => result.current.intents.onAddDayTemplate());
    const added = result.current.dayTemplates.drafts[1];
    expect(added.name).toBe("型2");
    // 定休日の水曜は初期値に入らない。
    expect(added.weekdays).toEqual(["sun", "thu", "fri", "sat"]);

    act(() => result.current.intents.onToggleWeekday(added.rowKey, "tue"));
    await act(async () => result.current.intents.onSaveChanges());

    const { templates } = mocks.saveDayTemplates.mock.calls[0][0];
    expect(templates).toEqual([
      {
        id: templateId,
        name: "平日",
        weekdays: ["mon"],
        slots: [
          {
            key: { kind: "time", startTime: "09:00", endTime: "22:00" },
            requirements: [{ positionId: hall, count: 2 }],
          },
        ],
      },
      {
        name: "型2",
        weekdays: ["sun", "tue", "thu", "fri", "sat"],
        slots: [
          {
            key: { kind: "time", startTime: "09:00", endTime: "22:00" },
            requirements: [{ positionId: hall, count: 2 }],
          },
        ],
      },
    ]);
  });
});

describe("AIサポート", () => {
  const suggestion = {
    status: "ok" as const,
    templates: [
      {
        name: "週末",
        weekdays: ["sat" as const, "sun" as const],
        slots: [
          {
            key: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
            requirements: [{ positionId: kitchen, count: 3 }],
          },
        ],
      },
    ],
  };

  it("下書きは編集中の型を置き換えるだけで、保存するまで保存処理を呼ばない", async () => {
    mocks.suggestShiftSetup.mockResolvedValue(suggestion);
    mocks.saveDayTemplates.mockResolvedValue(null);
    const { result } = renderController();

    act(() => result.current.assistDialog.open());
    await act(async () => result.current.intents.onRequestAssist("  土日は夜が忙しいです  "));

    expect(mocks.suggestShiftSetup).toHaveBeenCalledExactlyOnceWith({ ...scope, situation: "土日は夜が忙しいです" });
    expect(mocks.saveDayTemplates).not.toHaveBeenCalled();
    expect(result.current.assistDialog.isOpen).toBe(false);
    expect(result.current.pendingSections).toEqual(["dayTemplates"]);
    expect(result.current.dayTemplates.drafts.map((draft) => [draft.id, draft.name])).toEqual([[undefined, "週末"]]);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "下書きを表に入れました",
      description: "内容を確かめてから保存してください。",
    });

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.saveDayTemplates).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      templates: [
        {
          name: "週末",
          weekdays: ["sun", "sat"],
          slots: [
            {
              key: { kind: "time", startTime: "09:00", endTime: "22:00" },
              requirements: [{ positionId: kitchen, count: 3 }],
            },
          ],
        },
      ],
    });
  });

  it.each([
    ["unavailable", "いまはAIの下書きを使えません。\n「型を作る」から手で作れます。"],
    [
      "rateLimited",
      "短い時間に続けて作ったため、いまは下書きを作れません。\n少し時間をおいて、もう一度お試しください。",
    ],
  ] as const)("%s のときは、いまの型を変えず、次にできることをDialogに出す", async (status, message) => {
    mocks.suggestShiftSetup.mockResolvedValue({ status });
    const { result } = renderController();

    act(() => result.current.assistDialog.open());
    await act(async () => result.current.intents.onRequestAssist("平日は昼が混みます"));

    expect(result.current.assistDialog).toMatchObject({ isOpen: true, message });
    expect(result.current.pendingSections).toEqual([]);
    expect(result.current.dayTemplates.drafts.map((draft) => draft.id)).toEqual([templateId]);
  });

  it("店の状況が空のときは、actionを呼ばずに入力を促す", async () => {
    const { result } = renderController();

    await act(async () => result.current.intents.onRequestAssist("   "));

    expect(mocks.suggestShiftSetup).not.toHaveBeenCalled();
    expect(result.current.assistDialog.message).toBe("店の状況を入力してください");
  });

  it("AIサポートが無効な環境では、actionを呼ばない", async () => {
    const { result } = renderController({ ...setup, assistAvailable: false });

    await act(async () => result.current.intents.onRequestAssist("平日は昼が混みます"));

    expect(mocks.suggestShiftSetup).not.toHaveBeenCalled();
  });
});

describe("ポジションと休憩の決まりの保存", () => {
  it("ポジションを対象店舗へ保存し、Dialogを閉じる", async () => {
    mocks.savePositions.mockResolvedValue(null);
    const { result } = renderController();
    const positions = [
      { id: hall, name: "ホール", color: "#3b82f6" },
      { name: "レジ", color: "#7c3aed" },
    ];

    act(() => result.current.positionsDialog.open());
    await act(async () => result.current.intents.onSavePositions(positions));

    expect(mocks.savePositions).toHaveBeenCalledExactlyOnceWith({ ...scope, positions });
    expect(result.current.positionsDialog.isOpen).toBe(false);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "ポジションを保存しました" });
  });

  it("ポジションの保存に失敗したら、Toastへ渡してDialogを開いたままにする", async () => {
    const error = new Error("network error");
    mocks.savePositions.mockRejectedValue(error);
    const { result } = renderController();

    act(() => result.current.positionsDialog.open());
    await act(async () => result.current.intents.onSavePositions([{ id: hall, name: "ホール", color: "#3b82f6" }]));

    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
    expect(result.current.positionsDialog.isOpen).toBe(true);
  });

  it("休憩の決まりを保存し、nullで決まりをなくす", async () => {
    mocks.saveBreakRule.mockResolvedValue(null);
    const { result } = renderController();

    act(() => result.current.breakRuleDialog.open());
    await act(async () => result.current.intents.onSaveBreakRule({ minWorkMinutes: 360, breakMinutes: 45 }));
    expect(result.current.breakRuleDialog.isOpen).toBe(false);
    await act(async () => result.current.intents.onSaveBreakRule(null));

    expect(mocks.saveBreakRule.mock.calls).toEqual([
      [{ ...scope, breakRule: { minWorkMinutes: 360, breakMinutes: 45 } }],
      [{ ...scope, breakRule: null }],
    ]);
    expect(mocks.showSuccessToast.mock.calls).toEqual([
      [{ title: "休憩の決まりを保存しました" }],
      [{ title: "休憩の決まりをなくしました" }],
    ]);
  });
});

describe("閲覧専用", () => {
  const readOnlySetup: ShiftSetupData = {
    ...setup,
    canWriteBusinessData: false,
    businessWriteBlockReason: "usageLimitExceeded",
  };

  it("編集、保存、Dialogを開く操作を受け付けない", async () => {
    const { result } = renderController(readOnlySetup);

    act(() => {
      result.current.intents.onChangeRequiredCount(hallCell, 1);
      result.current.intents.onChangeStaffSkillLevel(staffA, "lead");
      result.current.positionsDialog.open();
      result.current.breakRuleDialog.open();
      result.current.assistDialog.open();
    });
    await act(async () => {
      result.current.intents.onSaveChanges();
      result.current.intents.onSavePositions([{ id: hall, name: "ホール", color: "#3b82f6" }]);
      result.current.intents.onSaveBreakRule(null);
      result.current.intents.onRequestAssist("平日は昼が混みます");
    });

    expect(result.current.pendingSections).toEqual([]);
    expect(result.current.positionsDialog.isOpen).toBe(false);
    expect(result.current.breakRuleDialog.isOpen).toBe(false);
    expect(result.current.assistDialog.isOpen).toBe(false);
    for (const remote of [
      mocks.savePositions,
      mocks.saveDayTemplates,
      mocks.saveBreakRule,
      mocks.saveStaffShiftProfiles,
      mocks.suggestShiftSetup,
    ]) {
      expect(remote).not.toHaveBeenCalled();
    }
  });

  it("編集の途中で書き込めなくなったら、編集中の値を捨てて離脱の確認も取り消す", () => {
    const { result, rerender } = renderController();
    act(() => result.current.intents.onChangeRequiredCount(hallCell, 1));
    act(() => result.current.positionsDialog.open());
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(true);

    act(() => rerender({ current: readOnlySetup }));

    expect(result.current.pendingSections).toEqual([]);
    expect(result.current.dayTemplates.drafts[0].slots[0].counts).toEqual({ [hall]: 2 });
    expect(result.current.positionsDialog.isOpen).toBe(false);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(false);
    expect(mocks.blocker.reset).toHaveBeenCalled();
  });
});

describe("ページを離れる操作", () => {
  it("タイトルの戻る操作はブラウザ履歴へ戻る", () => {
    const { result } = renderController();

    act(() => result.current.onBack());

    expect(mocks.historyBack).toHaveBeenCalledOnce();
  });

  it("保存していない変更があるときだけ、離脱とページの再読み込みを止める", () => {
    const { result } = renderController();
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(false);
    expect(mocks.blockerOptions?.enableBeforeUnload()).toBe(false);

    act(() => result.current.intents.onChangeStaffSkillLevel(staffA, "lead"));

    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(true);
    expect(mocks.blockerOptions?.enableBeforeUnload()).toBe(true);
  });

  it("確認で「保存して戻る」を選ぶと、保存できたときだけ離脱を進める", async () => {
    mocks.blocker.status = "blocked";
    mocks.saveDayTemplates.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("network error"));
    const { result } = renderController();
    expect(result.current.leaveDialog.isOpen).toBe(true);

    act(() => result.current.intents.onChangeRequiredCount(hallCell, 1));
    await act(async () => result.current.leaveDialog.onSaveAndLeave());
    expect(mocks.blocker.proceed).toHaveBeenCalledOnce();
    expect(mocks.blocker.reset).not.toHaveBeenCalled();

    act(() => result.current.intents.onChangeRequiredCount(hallCell, 1));
    await act(async () => result.current.leaveDialog.onSaveAndLeave());
    // 保存に失敗したら、離脱を取り消して画面に留まる。
    expect(mocks.blocker.proceed).toHaveBeenCalledOnce();
    expect(mocks.blocker.reset).toHaveBeenCalledOnce();
  });

  it("確認で「保存せず戻る」は離脱を進め、閉じる操作は画面に留まる", () => {
    const { result } = renderController();

    act(() => result.current.leaveDialog.onLeaveWithoutSaving());
    expect(mocks.blocker.proceed).toHaveBeenCalledOnce();

    act(() => result.current.leaveDialog.onStay());
    expect(mocks.blocker.reset).toHaveBeenCalledOnce();
    expect(mocks.saveDayTemplates).not.toHaveBeenCalled();
  });
});
