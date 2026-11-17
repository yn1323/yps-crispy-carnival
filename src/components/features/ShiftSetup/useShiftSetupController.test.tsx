// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftSetupData } from "./types";

const mocks = vi.hoisted(() => ({
  savePositions: vi.fn(),
  saveDayTemplates: vi.fn(),
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
        saveStaffShiftProfiles: "saveStaffShiftProfiles",
      },
      actions: { suggestShiftSetup: "suggestShiftSetup" },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: "savePositions" | "saveDayTemplates" | "saveStaffShiftProfiles") => mocks[reference],
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

import { ALL_DAY_ROW_ID } from "./dayTemplateDrafts";
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
    { _id: hall, name: "ホール", color: "#60a5fa", isDefault: true },
    { _id: kitchen, name: "キッチン", color: "#fb923c", isDefault: false },
  ],
  dayTemplates: [
    {
      _id: templateId,
      name: "平日",
      weekdays: ["mon", "tue"],
      appliesToHolidays: false,
      requirements: { kind: "time", bars: [{ positionId: hall, startTime: "09:00", endTime: "22:00" }] },
      requiresReentry: false,
    },
  ],
  breakRule: null,
  staffs: [
    { _id: staffA, name: "佐藤", positionSkills: [] },
    { _id: staffB, name: "鈴木", positionSkills: [] },
  ],
  assistAvailable: true,
};

const savedHallSegment = { positionId: hall, startTime: "09:00", endTime: "22:00", count: 1 };
const lunchKitchenSegment = { positionId: kitchen, startTime: "11:00", endTime: "14:00", count: 1 };

type Controller = { current: ReturnType<typeof useShiftSetupController> };

/** キッチンの昼に1人を入れる。必要人数に保存していない変更を作るために使う。 */
function addLunchKitchenCount(result: Controller) {
  act(() => result.current.intents.onChangeSegments(templateId, [savedHallSegment, lunchKitchenSegment]));
}

function getSegments(result: Controller, index = 0) {
  const { requirements } = result.current.dayTemplates.drafts[index];
  return requirements.kind === "time" ? requirements.segments : [];
}

function renderController(initialSetup: ShiftSetupData = setup) {
  return renderHook(({ current }) => useShiftSetupController({ shopId, organizationId, setup: current }), {
    initialProps: { current: initialSetup },
  });
}

beforeEach(() => {
  for (const mock of [
    mocks.savePositions,
    mocks.saveDayTemplates,
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
  it("人数を入れて保存すると、対象店舗とexpected organizationですべてのテンプレートを送る", async () => {
    mocks.saveDayTemplates.mockResolvedValue(null);
    const { result } = renderController();

    addLunchKitchenCount(result);
    expect(result.current.pendingSections).toEqual(["dayTemplates"]);

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.saveDayTemplates).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      templates: [
        {
          id: templateId,
          name: "平日",
          weekdays: ["mon", "tue"],
          appliesToHolidays: false,
          requirements: {
            kind: "time",
            bars: [
              { positionId: hall, startTime: "09:00", endTime: "22:00" },
              { positionId: kitchen, startTime: "11:00", endTime: "14:00" },
            ],
          },
        },
      ],
    });
    expect(mocks.saveStaffShiftProfiles).not.toHaveBeenCalled();
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "必要人数の設定を保存しました" });
    expect(result.current.pendingSections).toEqual([]);
  });

  it.each([
    [
      "パターン選択",
      {
        kind: "shiftType" as const,
        options: [
          { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
          { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
        ],
      },
      { kind: "shiftType" as const, options: [{ optionId: "early", counts: [{ positionId: hall, count: 2 }] }] },
      "late",
      {
        kind: "shiftType",
        options: [
          { optionId: "early", counts: [{ positionId: hall, count: 2 }] },
          { optionId: "late", counts: [{ positionId: kitchen, count: 3 }] },
        ],
      },
    ],
    [
      "日付選択",
      { kind: "dateOnly" as const },
      { kind: "dateOnly" as const, counts: [{ positionId: hall, count: 2 }] },
      ALL_DAY_ROW_ID,
      {
        kind: "dateOnly",
        counts: [
          { positionId: hall, count: 2 },
          { positionId: kitchen, count: 3 },
        ],
      },
    ],
  ])(
    "%sのテンプレートは、数字で入れた人数を保存の引数へ入れる",
    async (_, submissionPattern, requirements, rowId, expected) => {
      mocks.saveDayTemplates.mockResolvedValue(null);
      const { result } = renderController({
        ...setup,
        submissionPattern,
        dayTemplates: [{ ...setup.dayTemplates[0], requirements }],
      });

      act(() => result.current.intents.onChangeRequiredCount(templateId, { rowId, positionId: kitchen, count: 3 }));
      await act(async () => result.current.intents.onSaveChanges());

      expect(mocks.saveDayTemplates.mock.calls.map(([args]) => args.templates[0].requirements)).toEqual([expected]);
    },
  );

  it("変えたスタッフだけを、ポジションごとの値で送り、一人前は省く", async () => {
    mocks.saveStaffShiftProfiles.mockResolvedValue(null);
    const { result } = renderController();

    act(() => result.current.intents.onChangeStaffPositionLevel(staffA, kitchen, "unavailable"));
    act(() => result.current.intents.onChangeStaffPositionLevel(staffA, hall, "newcomer"));
    // 変えてから元の値へ戻したスタッフは、変更に数えない。
    act(() => result.current.intents.onChangeStaffPositionLevel(staffB, hall, "lead"));
    act(() => result.current.intents.onChangeStaffPositionLevel(staffB, hall, "standard"));
    expect(result.current.pendingSections).toEqual(["staffs"]);
    expect(result.current.staffProfiles).toEqual({
      [staffA]: { [hall]: "newcomer", [kitchen]: "unavailable" },
      [staffB]: {},
    });

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.saveStaffShiftProfiles).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      profiles: [
        {
          staffId: staffA,
          positionSkills: [
            { positionId: hall, level: "newcomer" },
            { positionId: kitchen, level: "unavailable" },
          ],
        },
      ],
    });
    expect(mocks.saveDayTemplates).not.toHaveBeenCalled();
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "スタッフの設定を保存しました" });
  });

  it("保存済みの値を一人前へ戻したスタッフは、空の値で送る", async () => {
    mocks.saveStaffShiftProfiles.mockResolvedValue(null);
    const { result } = renderController({
      ...setup,
      staffs: [{ _id: staffA, name: "佐藤", positionSkills: [{ positionId: kitchen, level: "lead" }] }],
    });
    expect(result.current.staffProfiles).toEqual({ [staffA]: { [kitchen]: "lead" } });

    act(() => result.current.intents.onChangeStaffPositionLevel(staffA, kitchen, "standard"));
    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.saveStaffShiftProfiles).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      profiles: [{ staffId: staffA, positionSkills: [] }],
    });
  });

  it("最後に残った担当できるポジションは、担当外にできない", () => {
    const { result } = renderController();

    act(() => result.current.intents.onChangeStaffPositionLevel(staffA, kitchen, "unavailable"));
    act(() => result.current.intents.onChangeStaffPositionLevel(staffA, hall, "unavailable"));

    expect(result.current.staffProfiles[staffA]).toEqual({ [kitchen]: "unavailable" });
  });

  it("両方に変更があれば両方を保存し、スタッフの保存に失敗したら保存できた分だけを伝える", async () => {
    const error = new Error("network error");
    mocks.saveDayTemplates.mockResolvedValue(null);
    mocks.saveStaffShiftProfiles.mockRejectedValue(error);
    const { result } = renderController();

    addLunchKitchenCount(result);
    act(() => result.current.intents.onChangeStaffPositionLevel(staffA, hall, "lead"));
    expect(result.current.pendingSections).toEqual(["dayTemplates", "staffs"]);

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.saveDayTemplates).toHaveBeenCalledTimes(1);
    expect(mocks.saveStaffShiftProfiles).toHaveBeenCalledTimes(1);
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "必要人数の設定を保存しました" });
    // 保存できなかったスタッフの変更は、編集中の値として残る。
    expect(result.current.staffProfiles[staffA]).toEqual({ [hall]: "lead" });
  });

  it("入れた人数を消して元の内容へ戻すと、保存していない変更はなくなる", () => {
    const { result } = renderController();

    addLunchKitchenCount(result);
    act(() => result.current.intents.onChangeSegments(templateId, [savedHallSegment]));

    expect(result.current.pendingSections).toEqual([]);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(false);
  });

  it("名前が空のテンプレートがあれば保存せず、そのテンプレートを開いて誤りを出す", async () => {
    const { result } = renderController();

    act(() => result.current.intents.onAddDayTemplate());
    const added = result.current.dayTemplates.drafts[1];
    act(() => result.current.intents.onRenameDayTemplate(templateId, ""));
    // 入力の途中では誤りを出さない。編集しているのは、足したばかりのテンプレートである。
    expect(result.current.dayTemplates.issueMessages).toEqual({});
    expect(result.current.dayTemplates.selectedRowKey).toBe(added.rowKey);

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.saveDayTemplates).not.toHaveBeenCalled();
    expect(result.current.dayTemplates.issueMessages).toEqual({ [templateId]: "テンプレート名を入力してください" });
    expect(result.current.dayTemplates.selectedRowKey).toBe(templateId);
    expect(mocks.toasterCreate).toHaveBeenCalledExactlyOnceWith({
      title: "テンプレート名を入力してください",
      type: "error",
    });
    expect(result.current.pendingSections).toEqual(["dayTemplates"]);
  });

  it("受付時間の外に出た人数が残るテンプレートは保存せず、切りそろえた人数へ置き換えると保存できる", async () => {
    mocks.saveDayTemplates.mockResolvedValue(null);
    const { result } = renderController({
      ...setup,
      dayTemplates: [
        {
          ...setup.dayTemplates[0],
          requirements: { kind: "time", bars: [{ positionId: hall, startTime: "08:00", endTime: "12:00" }] },
        },
      ],
    });
    // 読み込んだだけでは、外に出た人数を消さず、変更にも数えない。
    expect(getSegments(result)).toEqual([{ positionId: hall, startTime: "08:00", endTime: "12:00", count: 1 }]);
    expect(result.current.pendingSections).toEqual([]);

    act(() => result.current.intents.onToggleHoliday(templateId));
    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.saveDayTemplates).not.toHaveBeenCalled();
    expect(result.current.dayTemplates.issueMessages).toEqual({ [templateId]: "受付時間の外に人数が入っています" });

    act(() =>
      result.current.intents.onChangeSegments(templateId, [
        { positionId: hall, startTime: "09:00", endTime: "12:00", count: 1 },
      ]),
    );
    expect(result.current.dayTemplates.issueMessages).toEqual({});
    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.saveDayTemplates.mock.calls.map(([args]) => args.templates)).toEqual([
      [
        {
          id: templateId,
          name: "平日",
          weekdays: ["mon", "tue"],
          appliesToHolidays: true,
          requirements: { kind: "time", bars: [{ positionId: hall, startTime: "09:00", endTime: "12:00" }] },
        },
      ],
    ]);
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
    addLunchKitchenCount(result);

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

describe("保存の帯と離脱の確認を出す条件", () => {
  const notConfigured: ShiftSetupData = { ...setup, dayTemplates: [] };

  it.each([
    ["テンプレートを追加した直後", setup, 1],
    ["最初のテンプレートを作った直後", notConfigured, 0],
  ])("%sは、足したテンプレートを開くが、保存していない変更に数えず、離脱も止めない", (_, initialSetup, index) => {
    const { result } = renderController(initialSetup);

    act(() => result.current.intents.onAddDayTemplate());

    expect(result.current.dayTemplates.drafts).toHaveLength(index + 1);
    expect(result.current.dayTemplates.selectedRowKey).toBe(result.current.dayTemplates.drafts[index].rowKey);
    expect(result.current.pendingSections).toEqual([]);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(false);
    expect(mocks.blockerOptions?.enableBeforeUnload()).toBe(false);
  });

  it.each([
    [
      "名前を変える",
      (result: Controller, rowKey: string) => result.current.intents.onRenameDayTemplate(rowKey, "土日"),
    ],
    ["曜日を外す", (result: Controller, rowKey: string) => result.current.intents.onToggleWeekday(rowKey, "sat")],
    ["祝日を選ぶ", (result: Controller, rowKey: string) => result.current.intents.onToggleHoliday(rowKey)],
    [
      "人数を入れる",
      (result: Controller, rowKey: string) =>
        result.current.intents.onChangeSegments(rowKey, [
          { positionId: hall, startTime: "10:00", endTime: "15:00", count: 1 },
        ]),
    ],
    [
      "コピーする",
      (result: Controller, rowKey: string) =>
        result.current.intents.onCopyRequirements({ fromRowKey: templateId, toRowKey: rowKey }),
    ],
  ])("足したテンプレートで%sと、保存していない変更になり、離脱を止める", (_, change) => {
    const { result } = renderController();
    act(() => result.current.intents.onAddDayTemplate());
    const { rowKey } = result.current.dayTemplates.drafts[1];

    act(() => change(result, rowKey));

    expect(result.current.pendingSections).toEqual(["dayTemplates"]);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(true);
    expect(mocks.blockerOptions?.enableBeforeUnload()).toBe(true);
  });

  it("足したテンプレートの名前を作ったときの値へ戻すと、保存していない変更はなくなる", () => {
    const { result } = renderController();
    act(() => result.current.intents.onAddDayTemplate());
    const { rowKey } = result.current.dayTemplates.drafts[1];

    act(() => result.current.intents.onRenameDayTemplate(rowKey, "土日"));
    act(() => result.current.intents.onRenameDayTemplate(rowKey, "テンプレート2"));

    expect(result.current.pendingSections).toEqual([]);
    expect(result.current.dayTemplates.drafts).toHaveLength(2);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(false);
  });

  it("何も入れていないテンプレートを足したあとで保存済みのテンプレートを変えると、足したテンプレートも一緒に保存する", async () => {
    mocks.saveDayTemplates.mockResolvedValue(null);
    const { result } = renderController();

    act(() => result.current.intents.onAddDayTemplate());
    act(() => result.current.intents.onRenameDayTemplate(templateId, "平日昼"));
    expect(result.current.pendingSections).toEqual(["dayTemplates"]);
    await act(async () => result.current.intents.onSaveChanges());

    expect(
      mocks.saveDayTemplates.mock.calls.map(([args]) =>
        args.templates.map((item: { id?: string; name: string }) => [item.id, item.name]),
      ),
    ).toEqual([
      [
        [templateId, "平日昼"],
        [undefined, "テンプレート2"],
      ],
    ]);
  });

  it("スタッフだけを保存しても、何も入れていない足したテンプレートは送らず、編集中のまま残す", async () => {
    mocks.saveStaffShiftProfiles.mockResolvedValue(null);
    const { result } = renderController();

    act(() => result.current.intents.onAddDayTemplate());
    const added = result.current.dayTemplates.drafts[1];
    act(() => result.current.intents.onChangeStaffPositionLevel(staffA, hall, "lead"));
    expect(result.current.pendingSections).toEqual(["staffs"]);
    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.saveStaffShiftProfiles).toHaveBeenCalledTimes(1);
    expect(mocks.saveDayTemplates).not.toHaveBeenCalled();
    expect(result.current.dayTemplates.drafts.map((draft) => draft.rowKey)).toEqual([templateId, added.rowKey]);
    expect(result.current.dayTemplates.selectedRowKey).toBe(added.rowKey);
  });
});

describe("保存の応答を待っている間", () => {
  function holdDayTemplateSave() {
    let release: (() => void) | undefined;
    mocks.saveDayTemplates.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(null);
        }),
    );
    return () => release?.();
  }

  it("テンプレートとスタッフの編集、テンプレートの追加と削除を受け付けず、送った内容のまま保つ", async () => {
    const release = holdDayTemplateSave();
    const { result } = renderController();
    addLunchKitchenCount(result);
    act(() => result.current.intents.onAddDayTemplate());
    const added = result.current.dayTemplates.drafts[1];

    act(() => result.current.intents.onSaveChanges());
    await waitFor(() => expect(result.current.isSaving).toBe(true));

    act(() => {
      result.current.intents.onRenameDayTemplate(templateId, "平日昼");
      result.current.intents.onToggleWeekday(templateId, "fri");
      result.current.intents.onToggleHoliday(templateId);
      result.current.intents.onChangeSegments(templateId, []);
      result.current.intents.onCopyRequirements({ fromRowKey: templateId, toRowKey: added.rowKey });
      result.current.intents.onRemoveDayTemplate(added.rowKey);
      result.current.intents.onAddDayTemplate();
      result.current.intents.onChangeStaffPositionLevel(staffA, hall, "lead");
      result.current.intents.onChangeStaffPositionLevel(staffA, kitchen, "unavailable");
    });

    // 待っている間の操作は入らず、画面の値は送った内容と同じままである。
    expect(
      result.current.dayTemplates.drafts.map((draft) => [
        draft.rowKey,
        draft.name,
        draft.weekdays,
        draft.appliesToHolidays,
      ]),
    ).toEqual([
      [templateId, "平日", ["mon", "tue"], false],
      [added.rowKey, "テンプレート2", ["sun", "thu", "fri", "sat"], false],
    ]);
    expect(getSegments(result, 0)).toEqual([savedHallSegment, lunchKitchenSegment]);
    expect(getSegments(result, 1)).toEqual([]);
    expect(result.current.staffProfiles).toEqual({ [staffA]: {}, [staffB]: {} });
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();

    await act(async () => release());
    await waitFor(() => expect(result.current.isSaving).toBe(false));

    expect(mocks.saveDayTemplates).toHaveBeenCalledTimes(1);
    expect(mocks.saveStaffShiftProfiles).not.toHaveBeenCalled();
    expect(result.current.pendingSections).toEqual([]);
  });

  it("応答のあとは、また編集でき、その編集は保存していない変更として残る", async () => {
    const release = holdDayTemplateSave();
    const { result } = renderController();
    addLunchKitchenCount(result);

    act(() => result.current.intents.onSaveChanges());
    await waitFor(() => expect(result.current.isSaving).toBe(true));
    await act(async () => release());
    await waitFor(() => expect(result.current.isSaving).toBe(false));

    act(() => result.current.intents.onRenameDayTemplate(templateId, "平日昼"));

    expect(result.current.dayTemplates.drafts[0].name).toBe("平日昼");
    expect(result.current.pendingSections).toEqual(["dayTemplates"]);
  });

  it("入力の誤りで保存しなかったあとも、続けて編集できる", async () => {
    const { result } = renderController();

    act(() => result.current.intents.onRenameDayTemplate(templateId, ""));
    await act(async () => result.current.intents.onSaveChanges());
    expect(mocks.saveDayTemplates).not.toHaveBeenCalled();

    act(() => result.current.intents.onRenameDayTemplate(templateId, "平日昼"));

    expect(result.current.dayTemplates.drafts[0].name).toBe("平日昼");
  });

  it("保存に失敗したあとも、編集中の値を残して続けて編集できる", async () => {
    mocks.saveDayTemplates.mockRejectedValue(new Error("network error"));
    const { result } = renderController();
    addLunchKitchenCount(result);

    await act(async () => result.current.intents.onSaveChanges());
    expect(getSegments(result)).toEqual([savedHallSegment, lunchKitchenSegment]);

    act(() => result.current.intents.onRenameDayTemplate(templateId, "平日昼"));

    expect(result.current.dayTemplates.drafts[0].name).toBe("平日昼");
    expect(result.current.pendingSections).toEqual(["dayTemplates"]);
  });
});

describe("テンプレートの追加、切り替え、削除", () => {
  it("足したテンプレートは、まだ割り当てていない営業日と空の必要人数を初期値に持ち、idなしで保存される", async () => {
    mocks.saveDayTemplates.mockResolvedValue(null);
    const { result } = renderController();
    expect(result.current.dayTemplates.selectedRowKey).toBe(templateId);

    act(() => result.current.intents.onAddDayTemplate());
    const added = result.current.dayTemplates.drafts[1];
    expect(added.name).toBe("テンプレート2");
    // 定休日の水曜は初期値に入らない。
    expect(added.weekdays).toEqual(["sun", "thu", "fri", "sat"]);
    // 足したテンプレートを、そのまま編集できるように選ぶ。
    expect(result.current.dayTemplates.selectedRowKey).toBe(added.rowKey);

    // 別のテンプレートが持つ火曜を選んでも、そのテンプレートからは外れない。
    act(() => result.current.intents.onToggleWeekday(added.rowKey, "tue"));
    act(() => result.current.intents.onToggleHoliday(added.rowKey));
    await act(async () => result.current.intents.onSaveChanges());

    const { templates } = mocks.saveDayTemplates.mock.calls[0][0];
    expect(templates).toEqual([
      {
        id: templateId,
        name: "平日",
        weekdays: ["mon", "tue"],
        appliesToHolidays: false,
        requirements: { kind: "time", bars: [{ positionId: hall, startTime: "09:00", endTime: "22:00" }] },
      },
      {
        name: "テンプレート2",
        weekdays: ["sun", "tue", "thu", "fri", "sat"],
        appliesToHolidays: true,
        requirements: { kind: "time", bars: [] },
      },
    ]);
  });

  it("テンプレートを切り替えても、切り替える前のテンプレートの下書きは残る", () => {
    const { result } = renderController();

    act(() => result.current.intents.onAddDayTemplate());
    const added = result.current.dayTemplates.drafts[1];
    act(() =>
      result.current.intents.onChangeSegments(added.rowKey, [
        { positionId: hall, startTime: "10:00", endTime: "15:00", count: 1 },
      ]),
    );
    act(() => result.current.intents.onSelectDayTemplate(templateId));
    addLunchKitchenCount(result);
    act(() => result.current.intents.onSelectDayTemplate(added.rowKey));

    expect(result.current.dayTemplates.selectedRowKey).toBe(added.rowKey);
    expect(getSegments(result, 0)).toEqual([savedHallSegment, lunchKitchenSegment]);
    expect(getSegments(result, 1)).toEqual([{ positionId: hall, startTime: "10:00", endTime: "15:00", count: 1 }]);
  });

  it("ほかのテンプレートからコピーすると、選んだテンプレートの必要人数で置き換わる", () => {
    const { result } = renderController();

    act(() => result.current.intents.onAddDayTemplate());
    const added = result.current.dayTemplates.drafts[1];
    act(() => result.current.intents.onCopyRequirements({ fromRowKey: templateId, toRowKey: added.rowKey }));

    expect(getSegments(result, 1)).toEqual([savedHallSegment]);
    expect(result.current.dayTemplates.drafts[1].name).toBe("テンプレート2");
    // 見えている範囲がほとんど変わらないため、どのテンプレートから写したかを通知する。
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "「平日」の必要人数をコピーしました" });
  });

  it("コピー元が一覧にない場合と、同じテンプレートを選んだ場合は、写さず通知もしない", () => {
    const { result } = renderController();

    act(() => result.current.intents.onCopyRequirements({ fromRowKey: "missing", toRowKey: templateId }));
    act(() => result.current.intents.onCopyRequirements({ fromRowKey: templateId, toRowKey: templateId }));

    expect(getSegments(result)).toEqual([savedHallSegment]);
    expect(result.current.pendingSections).toEqual([]);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("編集しているテンプレートを削除すると、残ったテンプレートを選び、保存の引数から外す", async () => {
    mocks.saveDayTemplates.mockResolvedValue(null);
    const { result } = renderController();

    act(() => result.current.intents.onAddDayTemplate());
    const added = result.current.dayTemplates.drafts[1];
    act(() => result.current.intents.onSelectDayTemplate(templateId));
    act(() => result.current.intents.onRemoveDayTemplate(templateId));

    expect(result.current.dayTemplates.drafts.map((draft) => draft.rowKey)).toEqual([added.rowKey]);
    expect(result.current.dayTemplates.selectedRowKey).toBe(added.rowKey);

    await act(async () => result.current.intents.onSaveChanges());

    expect(
      mocks.saveDayTemplates.mock.calls.map(([args]) => args.templates.map((item: { name: string }) => item.name)),
    ).toEqual([["テンプレート2"]]);
  });

  it("テンプレートは10件までで、11件目は足さない", () => {
    const { result } = renderController();

    for (let count = 0; count < 15; count += 1) act(() => result.current.intents.onAddDayTemplate());

    expect(result.current.dayTemplates.drafts).toHaveLength(10);
    expect(result.current.dayTemplates.canAdd).toBe(false);
  });
});

describe("AIサポート", () => {
  const suggestion = {
    status: "ok" as const,
    templates: [
      {
        name: "週末",
        weekdays: ["sat" as const, "sun" as const],
        appliesToHolidays: false,
        requirements: {
          kind: "time" as const,
          bars: [
            { positionId: kitchen, startTime: "09:00", endTime: "22:00" },
            { positionId: kitchen, startTime: "17:00", endTime: "21:00" },
          ],
        },
      },
    ],
  };

  it("下書きは編集中のテンプレートを置き換えるだけで、保存するまで保存処理を呼ばない", async () => {
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
    expect(result.current.dayTemplates.selectedRowKey).toBe(result.current.dayTemplates.drafts[0].rowKey);
    // 下書きは、時間ごとの人数の区間で帯に入る。
    expect(getSegments(result)).toEqual([
      { positionId: kitchen, startTime: "09:00", endTime: "17:00", count: 1 },
      { positionId: kitchen, startTime: "17:00", endTime: "21:00", count: 2 },
      { positionId: kitchen, startTime: "21:00", endTime: "22:00", count: 1 },
    ]);
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
          appliesToHolidays: false,
          requirements: {
            kind: "time",
            bars: [
              { positionId: kitchen, startTime: "09:00", endTime: "22:00" },
              { positionId: kitchen, startTime: "17:00", endTime: "21:00" },
            ],
          },
        },
      ],
    });
  });

  it.each([
    ["unavailable", "いまはAIの下書きを使えません。\n「テンプレートを作る」から手で作れます。"],
    [
      "rateLimited",
      "短い時間に続けて作ったため、いまは下書きを作れません。\n少し時間をおいて、もう一度お試しください。",
    ],
  ] as const)("%s のときは、いまのテンプレートを変えず、次にできることをDialogに出す", async (status, message) => {
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

describe("ポジションの反映と保存", () => {
  const registerSaved = "position-register" as Id<"positions">;
  const hallInput = { id: hall, name: "ホール", color: "#60a5fa" };
  const kitchenInput = { id: kitchen, name: "キッチン", color: "#fb923c" };
  const registerInput = { name: "レジ", color: "#a78bfa" };
  const setupAfterPositionSave: ShiftSetupData = {
    ...setup,
    positions: [...setup.positions, { _id: registerSaved, name: "レジ", color: "#a78bfa", isDefault: false }],
  };

  /** レジを足して反映し、保存の前に、レジの昼の1人と佐藤の熟練度を入れる。レジの仮のIDを返す。 */
  function addRegisterWithCountAndLevel(result: Controller) {
    act(() => result.current.intents.onApplyPositions([hallInput, kitchenInput, registerInput]));
    const draftId = result.current.setup.positions[2]._id;
    act(() => {
      result.current.intents.onChangeSegments(templateId, [
        savedHallSegment,
        { positionId: draftId, startTime: "11:00", endTime: "14:00", count: 1 },
      ]);
      result.current.intents.onChangeStaffPositionLevel(staffA, draftId, "newcomer");
    });
    return draftId;
  }

  const templatesWithRegisterCount = [
    {
      id: templateId,
      name: "平日",
      weekdays: ["mon", "tue"],
      appliesToHolidays: false,
      requirements: {
        kind: "time",
        bars: [
          { positionId: hall, startTime: "09:00", endTime: "22:00" },
          { positionId: registerSaved, startTime: "11:00", endTime: "14:00" },
        ],
      },
    },
  ];
  const profilesWithRegisterLevel = [
    { staffId: staffA, positionSkills: [{ positionId: registerSaved, level: "newcomer" }] },
  ];

  it("Dialogの反映は保存を呼ばず、編集中の一覧へ入れてDialogを閉じ、保存していない変更に数える", () => {
    const { result } = renderController();

    act(() => result.current.positionsDialog.open());
    act(() => result.current.intents.onApplyPositions([kitchenInput, { ...hallInput, name: "フロア" }, registerInput]));

    expect(mocks.savePositions).not.toHaveBeenCalled();
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
    expect(result.current.positionsDialog.isOpen).toBe(false);
    expect(result.current.setup.positions.map((position) => [position.name, position.isDefault])).toEqual([
      ["キッチン", false],
      ["フロア", true],
      ["レジ", false],
    ]);
    expect(result.current.savedPositions).toEqual(setup.positions);
    expect(result.current.pendingSections).toEqual(["positions"]);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(true);
  });

  it("保存済みと同じ一覧へ戻して反映すると、保存していない変更はなくなる", () => {
    const { result } = renderController();
    act(() => result.current.intents.onApplyPositions([{ ...hallInput, name: "フロア" }, kitchenInput]));
    expect(result.current.pendingSections).toEqual(["positions"]);

    act(() => result.current.intents.onApplyPositions([hallInput, kitchenInput]));

    expect(result.current.pendingSections).toEqual([]);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(false);
  });

  it("足したポジションの人数と熟練度は、ポジションを先に保存して受け取ったIDで送り、仮のIDを送らない", async () => {
    mocks.savePositions.mockResolvedValue([hall, kitchen, registerSaved]);
    mocks.saveDayTemplates.mockResolvedValue(null);
    mocks.saveStaffShiftProfiles.mockResolvedValue(null);
    const { result } = renderController();
    const draftId = addRegisterWithCountAndLevel(result);
    // 保存の前から、足したポジションの人数と熟練度が編集中の値に入る。区間は、ポジションIDの順に並ぶ。
    expect(getSegments(result).map((item) => item.positionId)).toEqual([draftId, hall]);
    expect(result.current.staffProfiles[staffA]).toEqual({ [draftId]: "newcomer" });
    expect(result.current.pendingSections).toEqual(["positions", "dayTemplates", "staffs"]);

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.savePositions).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      positions: [hallInput, kitchenInput, registerInput],
    });
    expect(mocks.saveDayTemplates).toHaveBeenCalledExactlyOnceWith({ ...scope, templates: templatesWithRegisterCount });
    expect(mocks.saveStaffShiftProfiles).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      profiles: profilesWithRegisterLevel,
    });
    expect(mocks.savePositions.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveDayTemplates.mock.invocationCallOrder[0],
    );
    expect(mocks.saveDayTemplates.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveStaffShiftProfiles.mock.invocationCallOrder[0],
    );
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "ポジションと必要人数とスタッフの設定を保存しました",
    });
    expect(result.current.pendingSections).toEqual([]);
  });

  it("ポジションの保存のあとでテンプレートの保存に失敗しても、もう一度の保存はポジションを作り直さず、受け取ったIDで続きを保存する", async () => {
    const error = new Error("network error");
    mocks.savePositions.mockResolvedValue([hall, kitchen, registerSaved]);
    mocks.saveDayTemplates.mockRejectedValueOnce(error).mockResolvedValue(null);
    mocks.saveStaffShiftProfiles.mockResolvedValue(null);
    const { result, rerender } = renderController();
    addRegisterWithCountAndLevel(result);

    await act(async () => result.current.intents.onSaveChanges());
    // 保存できたポジションは、購読しているqueryの結果として届く。
    act(() => rerender({ current: setupAfterPositionSave }));

    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "ポジションの設定を保存しました" });
    expect(mocks.saveStaffShiftProfiles).not.toHaveBeenCalled();
    // 編集中の人数と熟練度は、保存後のIDを指す形で残る。
    expect(getSegments(result).map((item) => item.positionId)).toEqual([hall, registerSaved]);
    expect(result.current.staffProfiles[staffA]).toEqual({ [registerSaved]: "newcomer" });
    expect(result.current.pendingSections).toEqual(["dayTemplates", "staffs"]);

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.savePositions).toHaveBeenCalledOnce();
    expect(mocks.saveDayTemplates.mock.calls).toEqual([
      [{ ...scope, templates: templatesWithRegisterCount }],
      [{ ...scope, templates: templatesWithRegisterCount }],
    ]);
    expect(mocks.saveStaffShiftProfiles).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      profiles: profilesWithRegisterLevel,
    });
    expect(result.current.pendingSections).toEqual([]);
  });

  it("ポジションの保存に失敗したら、テンプレートとスタッフを保存せず、編集中の値を残してもう一度同じ内容で保存できる", async () => {
    const error = new Error("network error");
    mocks.savePositions.mockRejectedValueOnce(error).mockResolvedValue([hall, kitchen, registerSaved]);
    mocks.saveDayTemplates.mockResolvedValue(null);
    mocks.saveStaffShiftProfiles.mockResolvedValue(null);
    const { result } = renderController();
    const draftId = addRegisterWithCountAndLevel(result);

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
    expect(mocks.saveDayTemplates).not.toHaveBeenCalled();
    expect(mocks.saveStaffShiftProfiles).not.toHaveBeenCalled();
    expect(getSegments(result).map((item) => item.positionId)).toEqual([draftId, hall]);
    expect(result.current.pendingSections).toEqual(["positions", "dayTemplates", "staffs"]);

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.savePositions.mock.calls).toEqual([
      [{ ...scope, positions: [hallInput, kitchenInput, registerInput] }],
      [{ ...scope, positions: [hallInput, kitchenInput, registerInput] }],
    ]);
    expect(mocks.saveDayTemplates).toHaveBeenCalledExactlyOnceWith({ ...scope, templates: templatesWithRegisterCount });
    expect(mocks.saveStaffShiftProfiles).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      profiles: profilesWithRegisterLevel,
    });
  });

  it("テンプレートに入力の誤りがあれば、ポジションも保存しない", async () => {
    const { result } = renderController();
    act(() => result.current.intents.onApplyPositions([hallInput, kitchenInput, registerInput]));
    act(() => result.current.intents.onRenameDayTemplate(templateId, ""));

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.savePositions).not.toHaveBeenCalled();
    expect(mocks.saveDayTemplates).not.toHaveBeenCalled();
    expect(result.current.pendingSections).toEqual(["positions", "dayTemplates"]);
  });

  it("ポジションを削除して反映すると、そのポジションの人数と熟練度が編集中の値から外れる", async () => {
    mocks.savePositions.mockResolvedValue([hall]);
    const { result } = renderController({
      ...setup,
      dayTemplates: [
        {
          ...setup.dayTemplates[0],
          requirements: {
            kind: "time",
            bars: [
              { positionId: hall, startTime: "09:00", endTime: "22:00" },
              { positionId: kitchen, startTime: "11:00", endTime: "14:00" },
            ],
          },
        },
      ],
      staffs: [
        { _id: staffA, name: "佐藤", positionSkills: [{ positionId: kitchen, level: "lead" }] },
        // ホールが担当外の鈴木は、キッチンを削除すると担当できるポジションが残らない。
        { _id: staffB, name: "鈴木", positionSkills: [{ positionId: hall, level: "unavailable" }] },
      ],
    });
    act(() => result.current.intents.onChangeStaffPositionLevel(staffA, kitchen, "newcomer"));

    act(() => result.current.intents.onApplyPositions([hallInput]));

    expect(getSegments(result).map((item) => item.positionId)).toEqual([hall]);
    // 削除したポジションの熟練度は外れ、担当できるポジションが残らない鈴木は、ホールを担当できるものとして扱う。
    expect(result.current.staffProfiles).toEqual({ [staffA]: {}, [staffB]: {} });
    // 削除したポジションの人数を外しただけのテンプレートは、保存する変更に数えない。
    expect(result.current.pendingSections).toEqual(["positions", "staffs"]);
    expect(mocks.savePositions).not.toHaveBeenCalled();
  });

  it("保存の応答を待っている間は、ポジションの反映を受け付けない", async () => {
    let release: (() => void) | undefined;
    mocks.savePositions.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve([hall, kitchen]);
        }),
    );
    const { result } = renderController();
    act(() => result.current.intents.onApplyPositions([{ ...hallInput, name: "フロア" }, kitchenInput]));

    act(() => result.current.intents.onSaveChanges());
    await waitFor(() => expect(result.current.isSaving).toBe(true));
    act(() => result.current.intents.onApplyPositions([hallInput, kitchenInput, registerInput]));

    expect(result.current.setup.positions.map((position) => position.name)).toEqual(["フロア", "キッチン"]);

    await act(async () => release?.());
    expect(mocks.savePositions).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      positions: [{ ...hallInput, name: "フロア" }, kitchenInput],
    });
  });

  it("編集の途中で書き込めなくなったら、編集中のポジションを捨てる", () => {
    const { result, rerender } = renderController();
    act(() => result.current.intents.onApplyPositions([hallInput, kitchenInput, registerInput]));

    act(() =>
      rerender({
        current: { ...setup, canWriteBusinessData: false, businessWriteBlockReason: "usageLimitExceeded" },
      }),
    );

    expect(result.current.setup.positions).toEqual(setup.positions);
    expect(result.current.pendingSections).toEqual([]);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(false);
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
      result.current.intents.onChangeSegments(templateId, [savedHallSegment, lunchKitchenSegment]);
      result.current.intents.onRenameDayTemplate(templateId, "平日昼");
      result.current.intents.onToggleWeekday(templateId, "fri");
      result.current.intents.onToggleHoliday(templateId);
      result.current.intents.onAddDayTemplate();
      result.current.intents.onRemoveDayTemplate(templateId);
      result.current.intents.onChangeStaffPositionLevel(staffA, hall, "lead");
      result.current.positionsDialog.open();
      result.current.assistDialog.open();
    });
    await act(async () => {
      result.current.intents.onSaveChanges();
      result.current.intents.onApplyPositions([{ id: hall, name: "フロア", color: "#60a5fa" }]);
      result.current.intents.onRequestAssist("平日は昼が混みます");
    });

    expect(result.current.pendingSections).toEqual([]);
    expect(
      result.current.dayTemplates.drafts.map((draft) => [draft.name, draft.weekdays, draft.appliesToHolidays]),
    ).toEqual([["平日", ["mon", "tue"], false]]);
    expect(getSegments(result)).toEqual([savedHallSegment]);
    expect(result.current.staffProfiles).toEqual({ [staffA]: {}, [staffB]: {} });
    expect(mocks.toasterCreate).not.toHaveBeenCalled();
    expect(result.current.positionsDialog.isOpen).toBe(false);
    expect(result.current.assistDialog.isOpen).toBe(false);
    for (const remote of [
      mocks.savePositions,
      mocks.saveDayTemplates,
      mocks.saveStaffShiftProfiles,
      mocks.suggestShiftSetup,
    ]) {
      expect(remote).not.toHaveBeenCalled();
    }
  });

  it("編集の途中で書き込めなくなったら、編集中の値を捨てて離脱の確認も取り消す", () => {
    const { result, rerender } = renderController();
    addLunchKitchenCount(result);
    act(() => result.current.positionsDialog.open());
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(true);

    act(() => rerender({ current: readOnlySetup }));

    expect(result.current.pendingSections).toEqual([]);
    expect(getSegments(result)).toEqual([savedHallSegment]);
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

    act(() => result.current.intents.onChangeStaffPositionLevel(staffA, hall, "lead"));

    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(true);
    expect(mocks.blockerOptions?.enableBeforeUnload()).toBe(true);
  });

  it("確認で「保存して戻る」を選ぶと、保存できたときだけ離脱を進める", async () => {
    mocks.blocker.status = "blocked";
    mocks.saveDayTemplates.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("network error"));
    const { result } = renderController();
    expect(result.current.leaveDialog.isOpen).toBe(true);

    addLunchKitchenCount(result);
    await act(async () => result.current.leaveDialog.onSaveAndLeave());
    expect(mocks.blocker.proceed).toHaveBeenCalledOnce();
    expect(mocks.blocker.reset).not.toHaveBeenCalled();

    addLunchKitchenCount(result);
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
