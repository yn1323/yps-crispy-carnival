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
    { _id: hall, name: "ホール", color: "#3b82f6", isDefault: true },
    { _id: kitchen, name: "キッチン", color: "#c2410c", isDefault: false },
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

const savedHallBar = { id: "bar-1", positionId: hall, start: "09:00", end: "22:00" };
const lunchKitchenBar = { id: "bar-2", positionId: kitchen, start: "11:00", end: "14:00" };

type Controller = { current: ReturnType<typeof useShiftSetupController> };

/** キッチンの昼のバーを1本足す。必要人数に保存していない変更を作るために使う。 */
function addLunchKitchenBar(result: Controller) {
  act(() => result.current.intents.onChangeBars(templateId, [savedHallBar, lunchKitchenBar]));
}

function getBars(result: Controller, index = 0) {
  const { requirements } = result.current.dayTemplates.drafts[index];
  return requirements.kind === "time" ? requirements.bars : [];
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
  it("バーを足して保存すると、対象店舗とexpected organizationですべての型を送る", async () => {
    mocks.saveDayTemplates.mockResolvedValue(null);
    const { result } = renderController();

    addLunchKitchenBar(result);
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
  ])("%sの型は、数字で入れた人数を保存の引数へ入れる", async (_, submissionPattern, requirements, rowId, expected) => {
    mocks.saveDayTemplates.mockResolvedValue(null);
    const { result } = renderController({
      ...setup,
      submissionPattern,
      dayTemplates: [{ ...setup.dayTemplates[0], requirements }],
    });

    act(() => result.current.intents.onChangeRequiredCount(templateId, { rowId, positionId: kitchen, count: 3 }));
    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.saveDayTemplates.mock.calls.map(([args]) => args.templates[0].requirements)).toEqual([expected]);
  });

  it("変えたスタッフだけを、ポジションごとの値で送り、標準は省く", async () => {
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

  it("保存済みの値を標準へ戻したスタッフは、空の値で送る", async () => {
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

  it("最後に残った入れるポジションは、入れないにできない", () => {
    const { result } = renderController();

    act(() => result.current.intents.onChangeStaffPositionLevel(staffA, kitchen, "unavailable"));
    act(() => result.current.intents.onChangeStaffPositionLevel(staffA, hall, "unavailable"));

    expect(result.current.staffProfiles[staffA]).toEqual({ [kitchen]: "unavailable" });
  });

  it("まとめて入れないを付けると、入れるポジションがなくなるスタッフを飛ばし、その人数を通知する", () => {
    const { result } = renderController();
    // 佐藤が入れるのは、キッチンだけになる。
    act(() => result.current.intents.onChangeStaffPositionLevel(staffA, hall, "unavailable"));

    act(() =>
      result.current.intents.onChangeStaffPositionMarks({
        positionId: kitchen,
        staffIds: [staffA, staffB],
        mark: "unavailable",
        action: "apply",
      }),
    );

    expect(result.current.staffProfiles).toEqual({
      [staffA]: { [hall]: "unavailable" },
      [staffB]: { [kitchen]: "unavailable" },
    });
    expect(mocks.toasterCreate).toHaveBeenCalledExactlyOnceWith({
      title: "入れるポジションがなくなる1人は変えていません",
      type: "info",
    });
    expect(result.current.pendingSections).toEqual(["staffs"]);
  });

  it("まとめて印を付けると、選んだスタッフだけが変わり、通知は出さない", () => {
    const { result } = renderController();

    act(() =>
      result.current.intents.onChangeStaffPositionMarks({
        positionId: kitchen,
        staffIds: [staffB],
        mark: "newcomer",
        action: "apply",
      }),
    );

    expect(result.current.staffProfiles).toEqual({ [staffA]: {}, [staffB]: { [kitchen]: "newcomer" } });
    expect(mocks.toasterCreate).not.toHaveBeenCalled();
    expect(result.current.pendingSections).toEqual(["staffs"]);
  });

  it("まとめて印を外すと、その印のスタッフだけが標準へ戻り、通知は出さない", () => {
    const { result } = renderController({
      ...setup,
      staffs: [
        { _id: staffA, name: "佐藤", positionSkills: [{ positionId: kitchen, level: "unavailable" }] },
        { _id: staffB, name: "鈴木", positionSkills: [{ positionId: hall, level: "lead" }] },
      ],
    });
    act(() => result.current.intents.onChangeStaffPositionLevel(staffB, kitchen, "newcomer"));

    act(() =>
      result.current.intents.onChangeStaffPositionMarks({
        positionId: kitchen,
        staffIds: [staffA, staffB],
        mark: "unavailable",
        action: "remove",
      }),
    );

    // 別の印が付いた鈴木のキッチンと、ほかのポジションの値は変わらない。
    expect(result.current.staffProfiles).toEqual({
      [staffA]: {},
      [staffB]: { [hall]: "lead", [kitchen]: "newcomer" },
    });
    expect(mocks.toasterCreate).not.toHaveBeenCalled();
    expect(result.current.pendingSections).toEqual(["staffs"]);
  });

  it("両方に変更があれば両方を保存し、スタッフの保存に失敗したら保存できた分だけを伝える", async () => {
    const error = new Error("network error");
    mocks.saveDayTemplates.mockResolvedValue(null);
    mocks.saveStaffShiftProfiles.mockRejectedValue(error);
    const { result } = renderController();

    addLunchKitchenBar(result);
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

  it("足したバーを消して元の内容へ戻すと、保存していない変更はなくなる", () => {
    const { result } = renderController();

    addLunchKitchenBar(result);
    act(() => result.current.intents.onChangeBars(templateId, [savedHallBar]));

    expect(result.current.pendingSections).toEqual([]);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(false);
  });

  it("元に戻すと、必要人数とスタッフの編集中の値を捨てる", () => {
    const { result } = renderController();

    addLunchKitchenBar(result);
    act(() => result.current.intents.onChangeStaffPositionLevel(staffA, hall, "lead"));
    act(() => result.current.intents.onResetChanges());

    expect(result.current.pendingSections).toEqual([]);
    expect(getBars(result)).toEqual([savedHallBar]);
    expect(result.current.staffProfiles[staffA]).toEqual({});
  });

  it("名前が空の型があれば保存せず、その型を開いて誤りを出す", async () => {
    const { result } = renderController();

    act(() => result.current.intents.onAddDayTemplate());
    const added = result.current.dayTemplates.drafts[1];
    act(() => result.current.intents.onRenameDayTemplate(templateId, ""));
    // 入力の途中では誤りを出さない。編集しているのは、足したばかりの型である。
    expect(result.current.dayTemplates.issueMessages).toEqual({});
    expect(result.current.dayTemplates.selectedRowKey).toBe(added.rowKey);

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.saveDayTemplates).not.toHaveBeenCalled();
    expect(result.current.dayTemplates.issueMessages).toEqual({ [templateId]: "型の名前を入力してください" });
    expect(result.current.dayTemplates.selectedRowKey).toBe(templateId);
    expect(mocks.toasterCreate).toHaveBeenCalledExactlyOnceWith({ title: "型の名前を入力してください", type: "error" });
    expect(result.current.pendingSections).toEqual(["dayTemplates"]);
  });

  it("受付時間の外に出たバーが残る型は保存せず、切りそろえたバーへ置き換えると保存できる", async () => {
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
    // 読み込んだだけでは、外に出たバーを消さず、変更にも数えない。
    expect(getBars(result)).toEqual([{ id: "bar-1", positionId: hall, start: "08:00", end: "12:00" }]);
    expect(result.current.pendingSections).toEqual([]);

    act(() => result.current.intents.onToggleHoliday(templateId));
    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.saveDayTemplates).not.toHaveBeenCalled();
    expect(result.current.dayTemplates.issueMessages).toEqual({ [templateId]: "受付時間の外に出ているバーがあります" });

    act(() =>
      result.current.intents.onChangeBars(templateId, [
        { id: "bar-1", positionId: hall, start: "09:00", end: "12:00" },
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
    addLunchKitchenBar(result);

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
    ["型を追加した直後", setup, 1],
    ["最初の型を作った直後", notConfigured, 0],
  ])("%sは、足した型を開くが、保存していない変更に数えず、離脱も止めない", (_, initialSetup, index) => {
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
      "バーを足す",
      (result: Controller, rowKey: string) =>
        result.current.intents.onChangeBars(rowKey, [{ id: "bar-1", positionId: hall, start: "10:00", end: "15:00" }]),
    ],
    [
      "ほかの型からコピーする",
      (result: Controller, rowKey: string) =>
        result.current.intents.onCopyRequirements({ fromRowKey: templateId, toRowKey: rowKey }),
    ],
  ])("足した型で%sと、保存していない変更になり、離脱を止める", (_, change) => {
    const { result } = renderController();
    act(() => result.current.intents.onAddDayTemplate());
    const { rowKey } = result.current.dayTemplates.drafts[1];

    act(() => change(result, rowKey));

    expect(result.current.pendingSections).toEqual(["dayTemplates"]);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(true);
    expect(mocks.blockerOptions?.enableBeforeUnload()).toBe(true);
  });

  it("足した型の名前を作ったときの値へ戻すと、保存していない変更はなくなる", () => {
    const { result } = renderController();
    act(() => result.current.intents.onAddDayTemplate());
    const { rowKey } = result.current.dayTemplates.drafts[1];

    act(() => result.current.intents.onRenameDayTemplate(rowKey, "土日"));
    act(() => result.current.intents.onRenameDayTemplate(rowKey, "型2"));

    expect(result.current.pendingSections).toEqual([]);
    expect(result.current.dayTemplates.drafts).toHaveLength(2);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(false);
  });

  it("何も入れていない型を足したあとで保存済みの型を変えると、足した型も一緒に保存する", async () => {
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
        [undefined, "型2"],
      ],
    ]);
  });

  it("スタッフだけを保存しても、何も入れていない足した型は送らず、編集中のまま残す", async () => {
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

  it("型とスタッフの編集、型の追加と削除、元に戻す操作を受け付けず、送った内容のまま保つ", async () => {
    const release = holdDayTemplateSave();
    const { result } = renderController();
    addLunchKitchenBar(result);
    act(() => result.current.intents.onAddDayTemplate());
    const added = result.current.dayTemplates.drafts[1];

    act(() => result.current.intents.onSaveChanges());
    await waitFor(() => expect(result.current.isSaving).toBe(true));

    act(() => {
      result.current.intents.onRenameDayTemplate(templateId, "平日昼");
      result.current.intents.onToggleWeekday(templateId, "fri");
      result.current.intents.onToggleHoliday(templateId);
      result.current.intents.onChangeBars(templateId, []);
      result.current.intents.onCopyRequirements({ fromRowKey: templateId, toRowKey: added.rowKey });
      result.current.intents.onRemoveDayTemplate(added.rowKey);
      result.current.intents.onAddDayTemplate();
      result.current.intents.onChangeStaffPositionLevel(staffA, hall, "lead");
      result.current.intents.onChangeStaffPositionLevel(staffA, kitchen, "unavailable");
      result.current.intents.onChangeStaffPositionMarks({
        positionId: kitchen,
        staffIds: [staffA, staffB],
        mark: "unavailable",
        action: "apply",
      });
      result.current.intents.onResetChanges();
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
      [added.rowKey, "型2", ["sun", "thu", "fri", "sat"], false],
    ]);
    expect(getBars(result, 0)).toEqual([savedHallBar, lunchKitchenBar]);
    expect(getBars(result, 1)).toEqual([]);
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
    addLunchKitchenBar(result);

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
    addLunchKitchenBar(result);

    await act(async () => result.current.intents.onSaveChanges());
    expect(getBars(result)).toEqual([savedHallBar, lunchKitchenBar]);

    act(() => result.current.intents.onRenameDayTemplate(templateId, "平日昼"));

    expect(result.current.dayTemplates.drafts[0].name).toBe("平日昼");
    expect(result.current.pendingSections).toEqual(["dayTemplates"]);
  });
});

describe("型の追加、切り替え、削除", () => {
  it("足した型は、まだ割り当てていない営業日と空の必要人数を初期値に持ち、idなしで保存される", async () => {
    mocks.saveDayTemplates.mockResolvedValue(null);
    const { result } = renderController();
    expect(result.current.dayTemplates.selectedRowKey).toBe(templateId);

    act(() => result.current.intents.onAddDayTemplate());
    const added = result.current.dayTemplates.drafts[1];
    expect(added.name).toBe("型2");
    // 定休日の水曜は初期値に入らない。
    expect(added.weekdays).toEqual(["sun", "thu", "fri", "sat"]);
    // 足した型を、そのまま編集できるように選ぶ。
    expect(result.current.dayTemplates.selectedRowKey).toBe(added.rowKey);

    act(() => result.current.intents.onToggleWeekday(added.rowKey, "tue"));
    act(() => result.current.intents.onToggleHoliday(added.rowKey));
    await act(async () => result.current.intents.onSaveChanges());

    const { templates } = mocks.saveDayTemplates.mock.calls[0][0];
    expect(templates).toEqual([
      {
        id: templateId,
        name: "平日",
        weekdays: ["mon"],
        appliesToHolidays: false,
        requirements: { kind: "time", bars: [{ positionId: hall, startTime: "09:00", endTime: "22:00" }] },
      },
      {
        name: "型2",
        weekdays: ["sun", "tue", "thu", "fri", "sat"],
        appliesToHolidays: true,
        requirements: { kind: "time", bars: [] },
      },
    ]);
  });

  it("型を切り替えても、切り替える前の型の下書きは残る", () => {
    const { result } = renderController();

    act(() => result.current.intents.onAddDayTemplate());
    const added = result.current.dayTemplates.drafts[1];
    act(() =>
      result.current.intents.onChangeBars(added.rowKey, [
        { id: "bar-1", positionId: hall, start: "10:00", end: "15:00" },
      ]),
    );
    act(() => result.current.intents.onSelectDayTemplate(templateId));
    addLunchKitchenBar(result);
    act(() => result.current.intents.onSelectDayTemplate(added.rowKey));

    expect(result.current.dayTemplates.selectedRowKey).toBe(added.rowKey);
    expect(getBars(result, 0)).toEqual([savedHallBar, lunchKitchenBar]);
    expect(getBars(result, 1)).toEqual([{ id: "bar-1", positionId: hall, start: "10:00", end: "15:00" }]);
  });

  it("ほかの型からコピーすると、選んだ型の必要人数で置き換わる", () => {
    const { result } = renderController();

    act(() => result.current.intents.onAddDayTemplate());
    const added = result.current.dayTemplates.drafts[1];
    act(() => result.current.intents.onCopyRequirements({ fromRowKey: templateId, toRowKey: added.rowKey }));

    expect(getBars(result, 1)).toEqual([savedHallBar]);
    expect(result.current.dayTemplates.drafts[1].name).toBe("型2");
    // 見えている範囲がほとんど変わらないため、どの型から写したかを通知する。
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "「平日」の必要人数をコピーしました" });
  });

  it("コピー元が一覧にない場合と、同じ型を選んだ場合は、写さず通知もしない", () => {
    const { result } = renderController();

    act(() => result.current.intents.onCopyRequirements({ fromRowKey: "missing", toRowKey: templateId }));
    act(() => result.current.intents.onCopyRequirements({ fromRowKey: templateId, toRowKey: templateId }));

    expect(getBars(result)).toEqual([savedHallBar]);
    expect(result.current.pendingSections).toEqual([]);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("編集している型を削除すると、残った型を選び、保存の引数から外す", async () => {
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
    ).toEqual([["型2"]]);
  });

  it("型は20件までで、21件目は足さない", () => {
    const { result } = renderController();

    for (let count = 0; count < 25; count += 1) act(() => result.current.intents.onAddDayTemplate());

    expect(result.current.dayTemplates.drafts).toHaveLength(20);
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
    expect(result.current.dayTemplates.selectedRowKey).toBe(result.current.dayTemplates.drafts[0].rowKey);
    // 下書きは、バーの形で表に入る。
    expect(getBars(result)).toEqual([
      { id: "bar-1", positionId: kitchen, start: "09:00", end: "22:00" },
      { id: "bar-2", positionId: kitchen, start: "17:00", end: "21:00" },
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

describe("ポジションの反映と保存", () => {
  const registerSaved = "position-register" as Id<"positions">;
  const hallInput = { id: hall, name: "ホール", color: "#3b82f6" };
  const kitchenInput = { id: kitchen, name: "キッチン", color: "#c2410c" };
  const registerInput = { name: "レジ", color: "#7c3aed" };
  const setupAfterPositionSave: ShiftSetupData = {
    ...setup,
    positions: [...setup.positions, { _id: registerSaved, name: "レジ", color: "#7c3aed", isDefault: false }],
  };

  /** レジを足して反映し、保存の前に、レジのバーを1本と佐藤の熟練度を入れる。レジの仮のIDを返す。 */
  function addRegisterWithBarAndLevel(result: Controller) {
    act(() => result.current.intents.onApplyPositions([hallInput, kitchenInput, registerInput]));
    const draftId = result.current.setup.positions[2]._id;
    act(() => {
      result.current.intents.onChangeBars(templateId, [
        savedHallBar,
        { id: "bar-2", positionId: draftId, start: "11:00", end: "14:00" },
      ]);
      result.current.intents.onChangeStaffPositionLevel(staffA, draftId, "newcomer");
    });
    return draftId;
  }

  const templatesWithRegisterBar = [
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

  it("足したポジションのバーと熟練度は、ポジションを先に保存して受け取ったIDで送り、仮のIDを送らない", async () => {
    mocks.savePositions.mockResolvedValue([hall, kitchen, registerSaved]);
    mocks.saveDayTemplates.mockResolvedValue(null);
    mocks.saveStaffShiftProfiles.mockResolvedValue(null);
    const { result } = renderController();
    const draftId = addRegisterWithBarAndLevel(result);
    // 保存の前から、足したポジションのバーと熟練度が編集中の値に入る。
    expect(getBars(result).map((item) => item.positionId)).toEqual([hall, draftId]);
    expect(result.current.staffProfiles[staffA]).toEqual({ [draftId]: "newcomer" });
    expect(result.current.pendingSections).toEqual(["positions", "dayTemplates", "staffs"]);

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.savePositions).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      positions: [hallInput, kitchenInput, registerInput],
    });
    expect(mocks.saveDayTemplates).toHaveBeenCalledExactlyOnceWith({ ...scope, templates: templatesWithRegisterBar });
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

  it("ポジションの保存のあとで型の保存に失敗しても、もう一度の保存はポジションを作り直さず、受け取ったIDで続きを保存する", async () => {
    const error = new Error("network error");
    mocks.savePositions.mockResolvedValue([hall, kitchen, registerSaved]);
    mocks.saveDayTemplates.mockRejectedValueOnce(error).mockResolvedValue(null);
    mocks.saveStaffShiftProfiles.mockResolvedValue(null);
    const { result, rerender } = renderController();
    addRegisterWithBarAndLevel(result);

    await act(async () => result.current.intents.onSaveChanges());
    // 保存できたポジションは、購読しているqueryの結果として届く。
    act(() => rerender({ current: setupAfterPositionSave }));

    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "ポジションの設定を保存しました" });
    expect(mocks.saveStaffShiftProfiles).not.toHaveBeenCalled();
    // 編集中のバーと熟練度は、保存後のIDを指す形で残る。
    expect(getBars(result).map((item) => item.positionId)).toEqual([hall, registerSaved]);
    expect(result.current.staffProfiles[staffA]).toEqual({ [registerSaved]: "newcomer" });
    expect(result.current.pendingSections).toEqual(["dayTemplates", "staffs"]);

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.savePositions).toHaveBeenCalledOnce();
    expect(mocks.saveDayTemplates.mock.calls).toEqual([
      [{ ...scope, templates: templatesWithRegisterBar }],
      [{ ...scope, templates: templatesWithRegisterBar }],
    ]);
    expect(mocks.saveStaffShiftProfiles).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      profiles: profilesWithRegisterLevel,
    });
    expect(result.current.pendingSections).toEqual([]);
  });

  it("ポジションの保存に失敗したら、型とスタッフを保存せず、編集中の値を残してもう一度同じ内容で保存できる", async () => {
    const error = new Error("network error");
    mocks.savePositions.mockRejectedValueOnce(error).mockResolvedValue([hall, kitchen, registerSaved]);
    mocks.saveDayTemplates.mockResolvedValue(null);
    mocks.saveStaffShiftProfiles.mockResolvedValue(null);
    const { result } = renderController();
    const draftId = addRegisterWithBarAndLevel(result);

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
    expect(mocks.saveDayTemplates).not.toHaveBeenCalled();
    expect(mocks.saveStaffShiftProfiles).not.toHaveBeenCalled();
    expect(getBars(result).map((item) => item.positionId)).toEqual([hall, draftId]);
    expect(result.current.pendingSections).toEqual(["positions", "dayTemplates", "staffs"]);

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.savePositions.mock.calls).toEqual([
      [{ ...scope, positions: [hallInput, kitchenInput, registerInput] }],
      [{ ...scope, positions: [hallInput, kitchenInput, registerInput] }],
    ]);
    expect(mocks.saveDayTemplates).toHaveBeenCalledExactlyOnceWith({ ...scope, templates: templatesWithRegisterBar });
    expect(mocks.saveStaffShiftProfiles).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      profiles: profilesWithRegisterLevel,
    });
  });

  it("型に入力の誤りがあれば、ポジションも保存しない", async () => {
    const { result } = renderController();
    act(() => result.current.intents.onApplyPositions([hallInput, kitchenInput, registerInput]));
    act(() => result.current.intents.onRenameDayTemplate(templateId, ""));

    await act(async () => result.current.intents.onSaveChanges());

    expect(mocks.savePositions).not.toHaveBeenCalled();
    expect(mocks.saveDayTemplates).not.toHaveBeenCalled();
    expect(result.current.pendingSections).toEqual(["positions", "dayTemplates"]);
  });

  it("ポジションを削除して反映すると、そのポジションのバーと熟練度が編集中の値から外れ、元に戻すと戻る", async () => {
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
        // ホールに入れない鈴木は、キッチンを削除すると入れるポジションが残らない。
        { _id: staffB, name: "鈴木", positionSkills: [{ positionId: hall, level: "unavailable" }] },
      ],
    });
    act(() => result.current.intents.onChangeStaffPositionLevel(staffA, kitchen, "newcomer"));

    act(() => result.current.intents.onApplyPositions([hallInput]));

    expect(getBars(result).map((item) => item.positionId)).toEqual([hall]);
    // 削除したポジションの熟練度は外れ、入れるポジションが残らない鈴木は、ホールに入れるものとして扱う。
    expect(result.current.staffProfiles).toEqual({ [staffA]: {}, [staffB]: {} });
    // バーを外しただけの型は、保存する変更に数えない。
    expect(result.current.pendingSections).toEqual(["positions", "staffs"]);

    act(() => result.current.intents.onResetChanges());

    expect(result.current.setup.positions).toEqual(setup.positions);
    expect(getBars(result).map((item) => item.positionId)).toEqual([hall, kitchen]);
    expect(result.current.staffProfiles).toEqual({
      [staffA]: { [kitchen]: "lead" },
      [staffB]: { [hall]: "unavailable" },
    });
    expect(result.current.pendingSections).toEqual([]);
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
      result.current.intents.onChangeBars(templateId, [savedHallBar, lunchKitchenBar]);
      result.current.intents.onRenameDayTemplate(templateId, "平日昼");
      result.current.intents.onToggleWeekday(templateId, "fri");
      result.current.intents.onToggleHoliday(templateId);
      result.current.intents.onAddDayTemplate();
      result.current.intents.onRemoveDayTemplate(templateId);
      result.current.intents.onChangeStaffPositionLevel(staffA, hall, "lead");
      result.current.intents.onChangeStaffPositionMarks({
        positionId: kitchen,
        staffIds: [staffA, staffB],
        mark: "unavailable",
        action: "apply",
      });
      result.current.positionsDialog.open();
      result.current.assistDialog.open();
    });
    await act(async () => {
      result.current.intents.onSaveChanges();
      result.current.intents.onApplyPositions([{ id: hall, name: "フロア", color: "#3b82f6" }]);
      result.current.intents.onRequestAssist("平日は昼が混みます");
    });

    expect(result.current.pendingSections).toEqual([]);
    expect(
      result.current.dayTemplates.drafts.map((draft) => [draft.name, draft.weekdays, draft.appliesToHolidays]),
    ).toEqual([["平日", ["mon", "tue"], false]]);
    expect(getBars(result)).toEqual([savedHallBar]);
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
    addLunchKitchenBar(result);
    act(() => result.current.positionsDialog.open());
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(true);

    act(() => rerender({ current: readOnlySetup }));

    expect(result.current.pendingSections).toEqual([]);
    expect(getBars(result)).toEqual([savedHallBar]);
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

    addLunchKitchenBar(result);
    await act(async () => result.current.leaveDialog.onSaveAndLeave());
    expect(mocks.blocker.proceed).toHaveBeenCalledOnce();
    expect(mocks.blocker.reset).not.toHaveBeenCalled();

    addLunchKitchenBar(result);
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
