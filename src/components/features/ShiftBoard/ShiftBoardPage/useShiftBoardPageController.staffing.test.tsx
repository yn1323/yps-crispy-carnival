// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftData } from "@/src/domains/shift/types";
import { ManagerShopScopeProvider } from "@/src/providers/ManagerShopScopeProvider";
import type { ShiftBoardData, ShiftBoardStaffingData } from "../types";

const mocks = vi.hoisted(() => ({
  saveReference: Symbol("save"),
  confirmReference: Symbol("confirm"),
  applyTemplateReference: Symbol("applyDayTemplateToDates"),
  saveCustomReference: Symbol("saveDayCustomRequirements"),
  provisionalQueryReference: Symbol("getProvisionalAssignments"),
  save: vi.fn(),
  confirm: vi.fn(),
  applyDayTemplateToDates: vi.fn(),
  saveDayCustomRequirements: vi.fn(),
  navigate: vi.fn(),
  convexQuery: vi.fn(),
  toast: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  blocker: { status: "idle", reset: vi.fn(), proceed: vi.fn() },
}));

vi.mock("@tanstack/react-router", () => ({ useBlocker: () => mocks.blocker, useNavigate: () => mocks.navigate }));
vi.mock("convex/react", () => ({ useConvex: () => ({ query: mocks.convexQuery }) }));
vi.mock("@/convex/_generated/api", () => ({
  api: {
    shiftBoard: {
      mutations: { saveShiftAssignments: mocks.saveReference, confirmRecruitment: mocks.confirmReference },
      queries: { getProvisionalAssignments: mocks.provisionalQueryReference },
    },
    shiftSetup: {
      mutations: {
        applyDayTemplateToDates: mocks.applyTemplateReference,
        saveDayCustomRequirements: mocks.saveCustomReference,
      },
    },
  },
}));
vi.mock("@/src/hooks/useShopMutation", () => ({
  useShopMutation: (reference: unknown) => {
    if (reference === mocks.saveReference) return mocks.save;
    if (reference === mocks.confirmReference) return mocks.confirm;
    if (reference === mocks.applyTemplateReference) return mocks.applyDayTemplateToDates;
    if (reference === mocks.saveCustomReference) return mocks.saveDayCustomRequirements;
    throw new Error("unexpected mutation reference");
  },
}));
vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));
vi.mock("@/src/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }));

import { readStoredDetailMode, storeDetailMode } from "./detailModeStorage";
import { useShiftBoardPageController } from "./useShiftBoardPageController";

const shopId = "shop-a" as Id<"shops">;
const organizationId = "organization-a";
const recruitmentId = "recruitment-a" as Id<"recruitments">;
const submittedStaffId = "staff-submitted" as Id<"staffs">;
const unsubmittedStaffId = "staff-unsubmitted" as Id<"staffs">;
const hallId = "position-hall" as Id<"positions">;
const kitchenId = "position-kitchen" as Id<"positions">;
const templateId = "template-weekday" as Id<"shiftDayTemplates">;
const date = "2099-01-20";

const hall = { _id: hallId, name: "ホール", color: "#0d9488", isDefault: true };
const kitchen = { _id: kitchenId, name: "キッチン", color: "#f97316", isDefault: false };

// 何も設定していない店舗。ポジションは既定の1つだけで、未提出のスタッフが1人いる。
const data: ShiftBoardData = {
  shopId,
  canWriteBusinessData: true,
  businessWriteBlockReason: null,
  recruitment: {
    _id: recruitmentId,
    periodStart: date,
    periodEnd: date,
    deadline: "2099-01-17",
    shopClosedDates: [],
    status: "open",
    confirmedAt: null,
    reminderScheduledAt: null,
    lastReminderSentAt: null,
    draftSavedAt: null,
  },
  submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  staffs: [
    { _id: submittedStaffId, name: "提出済み", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: unsubmittedStaffId, name: "未提出", isSubmitted: false, wasSubmittedAtDraft: false },
  ],
  requestedSlots: [{ staffId: submittedStaffId, date, startTime: "10:00", endTime: "18:00" }],
  requestedDates: [],
  shiftAssignments: [],
  positions: [hall],
  timeRange: { start: 9, end: 22, unit: 30 },
};

const emptyStaffing: ShiftBoardStaffingData = {
  breakRule: null,
  staffProfiles: [],
  hasPreviousConfirmedRecruitment: false,
  isLocked: false,
  templates: [],
  days: [{ date, source: "none", templateId: null, templateName: null, requirements: null }],
};

const template = { _id: templateId, name: "平日" };
// 曜日の型が当たり、ホールに9:00〜22:00で2人が必要な日。
const weekdayDay: ShiftBoardStaffingData["days"][number] = {
  date,
  source: "weekday",
  templateId,
  templateName: "平日",
  requirements: {
    kind: "time",
    bars: [
      { positionId: hallId, startTime: "09:00", endTime: "22:00" },
      { positionId: hallId, startTime: "09:00", endTime: "22:00" },
    ],
  },
};
const templateStaffing: ShiftBoardStaffingData = { ...emptyStaffing, templates: [template], days: [weekdayDay] };

function Scope({ children }: { children: ReactNode }) {
  return (
    <ManagerShopScopeProvider shopId={shopId} expectedOrganizationId={organizationId}>
      {children}
    </ManagerShopScopeProvider>
  );
}

function OtherShopScope({ children }: { children: ReactNode }) {
  return (
    <ManagerShopScopeProvider shopId="shop-other" expectedOrganizationId={organizationId}>
      {children}
    </ManagerShopScopeProvider>
  );
}

type RenderOptions = {
  data?: ShiftBoardData;
  staffing?: ShiftBoardStaffingData;
  wrapper?: (props: { children: ReactNode }) => ReactNode;
};

function renderController({ data: currentData = data, staffing, wrapper = Scope }: RenderOptions = {}) {
  return renderHook(() => useShiftBoardPageController(currentData, recruitmentId, undefined, undefined, staffing), {
    wrapper,
  });
}

/** ShiftFormのマウント後と同じく、初期の勤務を受け取った状態にする。 */
function renderInitialized(options: RenderOptions = {}) {
  const hook = renderController(options);
  act(() => hook.result.current.intents.onShiftsChange(hook.result.current.viewModel.shiftForm.initialShifts));
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mocks.save.mockResolvedValue(null);
  mocks.confirm.mockResolvedValue(null);
  mocks.applyDayTemplateToDates.mockResolvedValue(null);
  mocks.saveDayCustomRequirements.mockResolvedValue(null);
  mocks.convexQuery.mockResolvedValue([]);
});

afterEach(() => vi.restoreAllMocks());

describe("店舗の設定をシフト表へ渡す", () => {
  it("日ごとの必要人数、当てられる型、休憩の決まりをShiftFormの形へ変換して渡す", () => {
    const { result } = renderController({
      staffing: { ...templateStaffing, breakRule: { minWorkMinutes: 360, breakMinutes: 60 } },
    });

    expect(result.current.viewModel.shiftForm.staffing).toEqual({
      breakRule: { minWorkMinutes: 360, breakMinutes: 60 },
      isLocked: false,
      templates: [{ id: templateId, name: "平日" }],
      days: [weekdayDay],
    });
  });

  it("何も設定していない店舗の設定は、未設定の日と、空の型の一覧と、決まりなしで渡す", () => {
    const { result } = renderController({ staffing: emptyStaffing });

    expect(result.current.viewModel.shiftForm.staffing).toEqual({
      breakRule: null,
      isLocked: false,
      templates: [],
      days: [{ date, source: "none", templateId: null, templateName: null, requirements: null }],
    });
  });

  it("ポジションごとの値を、値のあるスタッフにだけ付ける", () => {
    const leadId = "staff-lead" as Id<"staffs">;
    const { result } = renderController({
      data: {
        ...data,
        positions: [hall, kitchen],
        staffs: [...data.staffs, { _id: leadId, name: "責任者", isSubmitted: true, wasSubmittedAtDraft: false }],
      },
      staffing: {
        ...emptyStaffing,
        staffProfiles: [
          {
            staffId: submittedStaffId,
            positionSkills: [
              { positionId: hallId, level: "newcomer" },
              { positionId: kitchenId, level: "unavailable" },
            ],
          },
          { staffId: leadId, positionSkills: [{ positionId: kitchenId, level: "lead" }] },
        ],
      },
    });

    const staffs = result.current.viewModel.shiftForm.staffs;
    expect(
      staffs.map((staff) => ({
        id: staff.id,
        positionSkills: staff.positionSkills,
        hasPositionSkills: Object.hasOwn(staff, "positionSkills"),
      })),
    ).toEqual([
      {
        id: submittedStaffId,
        positionSkills: [
          { positionId: hallId, level: "newcomer" },
          { positionId: kitchenId, level: "unavailable" },
        ],
        hasPositionSkills: true,
      },
      { id: unsubmittedStaffId, positionSkills: undefined, hasPositionSkills: false },
      { id: leadId, positionSkills: [{ positionId: kitchenId, level: "lead" }], hasPositionSkills: true },
    ]);
  });

  it("休憩の決まりを、希望から作った勤務の候補へ当てる", () => {
    const { result } = renderController({
      staffing: { ...emptyStaffing, breakRule: { minWorkMinutes: 360, breakMinutes: 60 } },
    });

    expect(
      result.current.viewModel.shiftForm.initialShifts.map((shift) => [
        shift.staffId,
        shift.positions.map((position) => [position.start, position.end]),
        shift.breaks,
      ]),
    ).toEqual([
      [submittedStaffId, [["10:00", "18:00"]], [{ start: "13:30", end: "14:30" }]],
      [unsubmittedStaffId, [], undefined],
    ]);
  });

  it("入れないポジションへの割当を、ポジション名の入った確認事項として出す", () => {
    const { result } = renderInitialized({
      data: {
        ...data,
        positions: [hall, kitchen],
        shiftAssignments: [
          { staffId: submittedStaffId, date, startTime: "10:00", endTime: "18:00", positionId: kitchenId },
        ],
      },
      staffing: {
        ...emptyStaffing,
        staffProfiles: [
          { staffId: submittedStaffId, positionSkills: [{ positionId: kitchenId, level: "unavailable" }] },
        ],
      },
    });

    expect(result.current.viewModel.shiftForm.validationWarnings).toEqual([
      {
        code: "POSITION_UNAVAILABLE",
        date,
        staffId: submittedStaffId,
        message: "入れないポジションの勤務があります（キッチン）",
      },
    ]);
  });
});

describe("店舗の設定を渡さない利用箇所", () => {
  it("設定、スタッフの属性、休憩の初期値、仮の勤務の操作を足さず、表示の初期状態をシンプルにする", () => {
    const { result } = renderInitialized();
    const { shiftForm } = result.current.viewModel;

    expect(shiftForm.staffing).toBeUndefined();
    expect(shiftForm.staffs).toStrictEqual([
      { id: submittedStaffId, name: "提出済み", isSubmitted: true, isRemoved: undefined, createdAt: undefined },
      { id: unsubmittedStaffId, name: "未提出", isSubmitted: false, isRemoved: undefined, createdAt: undefined },
    ]);
    expect(shiftForm.initialShifts.map((shift) => Object.hasOwn(shift, "breaks"))).toEqual([false, false]);
    expect(shiftForm.initialDetailMode).toBe(false);
    expect(shiftForm.detailActions.provisionalAction).toBeUndefined();
    expect(shiftForm.validationWarnings).toEqual([]);
  });
});

describe("表示の初期状態", () => {
  const configuredCases: Array<[string, RenderOptions]> = [
    ["ポジションが2つ以上ある", { data: { ...data, positions: [hall, kitchen] }, staffing: emptyStaffing }],
    ["当てられる型がある", { staffing: templateStaffing }],
    ["休憩の決まりがある", { staffing: { ...emptyStaffing, breakRule: { minWorkMinutes: 360, breakMinutes: 45 } } }],
    [
      "ポジションごとの値を持つスタッフがいる",
      {
        staffing: {
          ...emptyStaffing,
          staffProfiles: [{ staffId: submittedStaffId, positionSkills: [{ positionId: hallId, level: "lead" }] }],
        },
      },
    ],
  ];

  it("何も設定していない店舗は、まだ表示を選んでいなければシンプルで開く", () => {
    const { result } = renderController({ staffing: emptyStaffing });

    expect(result.current.viewModel.shiftForm.initialDetailMode).toBe(false);
  });

  it.each(configuredCases)("%s店舗は、まだ表示を選んでいなければくわしくで開く", (_label, options) => {
    const { result } = renderController(options);

    expect(result.current.viewModel.shiftForm.initialDetailMode).toBe(true);
  });

  it.each(configuredCases)("%s店舗でも、シンプルを選んだ端末ではシンプルで開く", (_label, options) => {
    storeDetailMode(false);

    const { result } = renderController(options);

    expect(result.current.viewModel.shiftForm.initialDetailMode).toBe(false);
  });

  it("何も設定していない店舗でも、くわしくを選んだ端末ではくわしくで開く", () => {
    storeDetailMode(true);

    const { result } = renderController({ staffing: emptyStaffing });

    expect(result.current.viewModel.shiftForm.initialDetailMode).toBe(true);
  });

  it("開いたあとで店舗の設定が変わっても、表示の初期状態を変えない", () => {
    const { result, rerender } = renderHook(
      ({ staffing }: { staffing: ShiftBoardStaffingData }) =>
        useShiftBoardPageController(data, recruitmentId, undefined, undefined, staffing),
      { wrapper: Scope, initialProps: { staffing: emptyStaffing } },
    );

    rerender({ staffing: templateStaffing });

    expect(result.current.viewModel.shiftForm.initialDetailMode).toBe(false);
    expect(result.current.viewModel.shiftForm.staffing?.templates).toEqual([{ id: templateId, name: "平日" }]);
  });

  it("利用者が切り替えた表示を端末に覚える", () => {
    const { result } = renderController({ staffing: emptyStaffing });
    expect(readStoredDetailMode()).toBeNull();

    act(() => result.current.intents.onDetailModeChange(true));
    expect(readStoredDetailMode()).toBe(true);

    act(() => result.current.intents.onDetailModeChange(false));
    expect(readStoredDetailMode()).toBe(false);
  });
});

describe("前回の勤務を仮で入れる操作を出す条件", () => {
  const withPrevious: ShiftBoardStaffingData = { ...emptyStaffing, hasPreviousConfirmedRecruitment: true };

  it("前回確定があり、未提出者がいて、未確定で、書き込める場合に出す", () => {
    const { result } = renderController({ staffing: withPrevious });

    expect(result.current.viewModel.shiftForm.detailActions.provisionalAction).toEqual({
      onInsert: expect.any(Function),
      isLoading: false,
    });
  });

  it.each<[string, RenderOptions]>([
    ["前回確定した募集がない", { staffing: emptyStaffing }],
    ["店舗の設定が渡されない", {}],
    [
      "未提出者がいない",
      {
        data: { ...data, staffs: data.staffs.map((staff) => ({ ...staff, isSubmitted: true })) },
        staffing: withPrevious,
      },
    ],
    [
      "未提出なのが削除済みのスタッフだけ",
      {
        data: {
          ...data,
          staffs: data.staffs.map((staff) => (staff.isSubmitted ? staff : { ...staff, isRemoved: true })),
        },
        staffing: withPrevious,
      },
    ],
    [
      "募集が確定済み",
      {
        data: { ...data, recruitment: { ...data.recruitment, status: "confirmed", confirmedAt: 1 } },
        staffing: withPrevious,
      },
    ],
    [
      "閲覧専用",
      {
        data: { ...data, canWriteBusinessData: false, businessWriteBlockReason: "usageLimitExceeded" },
        staffing: withPrevious,
      },
    ],
    ["組織・店舗scopeがない", { staffing: withPrevious, wrapper: ({ children }) => children }],
    ["組織・店舗scopeが別の店舗を指す", { staffing: withPrevious, wrapper: OtherShopScope }],
  ])("%s場合は出さない", (_label, options) => {
    const { result } = renderController(options);

    expect(Object.hasOwn(result.current.viewModel.shiftForm.detailActions, "provisionalAction")).toBe(false);
  });
});

describe("前回の勤務を仮で入れる", () => {
  const withPrevious: ShiftBoardStaffingData = { ...emptyStaffing, hasPreviousConfirmedRecruitment: true };
  const candidate = {
    staffId: unsubmittedStaffId,
    date,
    startTime: "11:00",
    endTime: "17:00",
    positionId: hallId,
    breaks: [{ startTime: "13:00", endTime: "14:00" }],
  };

  function renderWithApply() {
    const hook = renderInitialized({ staffing: withPrevious });
    const apply = vi.fn<(update: (current: ShiftData[]) => ShiftData[]) => void>();
    hook.result.current.viewModel.shiftForm.applyShiftsRef.current = apply;
    return { ...hook, apply };
  }

  const insert = async (result: { current: ReturnType<typeof useShiftBoardPageController> }) => {
    await act(async () => {
      result.current.viewModel.shiftForm.detailActions.provisionalAction?.onInsert();
    });
  };

  it("この店舗と募集の候補を取得し、未提出者の勤務のない日へ仮の印付きで入れる", async () => {
    mocks.convexQuery.mockResolvedValue([
      candidate,
      { ...candidate, staffId: submittedStaffId, startTime: "09:00", endTime: "12:00" },
    ]);
    const { result, apply } = renderWithApply();
    const initialShifts = result.current.viewModel.shiftForm.initialShifts;

    await insert(result);

    expect(mocks.convexQuery).toHaveBeenCalledExactlyOnceWith(mocks.provisionalQueryReference, {
      shopId,
      expectedOrganizationId: organizationId,
      recruitmentId,
    });
    expect(apply).toHaveBeenCalledTimes(1);
    const applied = apply.mock.calls[0][0](initialShifts);
    expect(applied).toEqual([
      initialShifts[0],
      {
        ...initialShifts[1],
        positions: [
          {
            id: `seg-${unsubmittedStaffId}-${date}-provisional-0`,
            positionId: hallId,
            positionName: "ホール",
            color: "#0d9488",
            start: "11:00",
            end: "17:00",
          },
        ],
        breaks: [{ start: "13:00", end: "14:00" }],
        isProvisional: true,
      },
    ]);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "前回の勤務を1日分、仮で入れました" });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("画面で編集したあとの勤務を基準にし、勤務を入れた日には仮の勤務を入れない", async () => {
    mocks.convexQuery.mockResolvedValue([candidate]);
    const { result, apply } = renderWithApply();
    const edited = result.current.viewModel.shiftForm.initialShifts.map((shift) =>
      shift.staffId === unsubmittedStaffId
        ? {
            ...shift,
            positions: [
              {
                id: "seg-manual",
                positionId: hallId,
                positionName: "ホール",
                color: "#0d9488",
                start: "09:00",
                end: "12:00",
              },
            ],
          }
        : shift,
    );
    act(() => result.current.intents.onShiftsChange(edited));

    await insert(result);

    expect(apply).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      title: "仮で入れられる前回の勤務がありませんでした",
      type: "info",
    });
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it.each([
    ["候補が1件もない", []],
    ["募集を確認できず候補がnullで返る", null],
  ])("%s場合は、勤務を変えずに案内だけを出す", async (_label, candidates) => {
    mocks.convexQuery.mockResolvedValue(candidates);
    const { result, apply } = renderWithApply();

    await insert(result);

    expect(apply).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      title: "仮で入れられる前回の勤務がありませんでした",
      type: "info",
    });
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("候補の取得に失敗した場合は、勤務を変えずにエラーを知らせる", async () => {
    const error = new Error("network");
    mocks.convexQuery.mockRejectedValue(error);
    const { result, apply } = renderWithApply();

    await insert(result);

    expect(apply).not.toHaveBeenCalled();
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("シフト表が取り込みを受け付ける前は、候補を取得しない", async () => {
    const { result } = renderInitialized({ staffing: withPrevious });

    await insert(result);

    expect(mocks.convexQuery).not.toHaveBeenCalled();
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });
});

describe("その日の必要人数の変更と設定ページへの導線", () => {
  type Controller = { current: ReturnType<typeof useShiftBoardPageController> };
  const actionsOf = (result: Controller) => {
    const actions = result.current.viewModel.shiftForm.detailActions.dayStaffingActions;
    if (!actions) throw new Error("dayStaffingActions is not provided");
    return actions;
  };

  it("選んだ日へ型を当てる操作は、この募集と日付と型を1回で送り、成功を返す", async () => {
    const { result } = renderController({ staffing: templateStaffing });

    let applied: boolean | undefined;
    await act(async () => {
      applied = await actionsOf(result).onApplyTemplate([date], templateId);
    });

    expect(applied).toBe(true);
    expect(mocks.applyDayTemplateToDates.mock.calls).toEqual([[{ recruitmentId, dates: [date], templateId }]]);
    // 1日だけの変更は、帯が変わることで伝わるため、成功の通知を出さない。
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("複数の日へまとめて当てた場合は、1回の呼び出しで送り、日数を成功の通知で伝える", async () => {
    const { result } = renderController({ staffing: templateStaffing });

    await act(async () => {
      await actionsOf(result).onApplyTemplate(["2099-01-20", "2099-01-21", "2099-01-24"], templateId);
    });

    expect(mocks.applyDayTemplateToDates.mock.calls).toEqual([
      [{ recruitmentId, dates: ["2099-01-20", "2099-01-21", "2099-01-24"], templateId }],
    ]);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "3日の型を変更しました" });
  });

  it("曜日の設定に戻す操作は、型をnullで送る", async () => {
    const { result } = renderController({ staffing: templateStaffing });

    await act(async () => {
      await actionsOf(result).onApplyTemplate([date], null);
    });

    expect(mocks.applyDayTemplateToDates.mock.calls).toEqual([[{ recruitmentId, dates: [date], templateId: null }]]);
  });

  it("型を当てる操作に失敗した場合は、エラーを知らせて失敗を返す", async () => {
    const error = new Error("rejected");
    mocks.applyDayTemplateToDates.mockRejectedValue(error);
    const { result } = renderController({ staffing: templateStaffing });

    let applied: boolean | undefined;
    await act(async () => {
      applied = await actionsOf(result).onApplyTemplate([date], templateId);
    });

    expect(applied).toBe(false);
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("処理中にもう一度当てても、2回目は送らずに失敗を返す", async () => {
    let resolveFirst: (value: null) => void = () => {};
    mocks.applyDayTemplateToDates.mockReturnValue(
      new Promise<null>((resolve) => {
        resolveFirst = resolve;
      }),
    );
    const { result } = renderController({ staffing: templateStaffing });

    let first: Promise<boolean> | undefined;
    let second: boolean | undefined;
    await act(async () => {
      first = actionsOf(result).onApplyTemplate([date], templateId);
      second = await actionsOf(result).onApplyTemplate([date], null);
    });
    expect(second).toBe(false);
    expect(actionsOf(result).isPending).toBe(true);

    await act(async () => {
      resolveFirst(null);
      await first;
    });

    expect(mocks.applyDayTemplateToDates).toHaveBeenCalledTimes(1);
    expect(actionsOf(result).isPending).toBe(false);
  });

  it("この日だけの必要人数は、この募集と日付と必要人数を送り、保存したことを伝える", async () => {
    const requirements = {
      kind: "time" as const,
      bars: [{ positionId: hallId as string, startTime: "09:00", endTime: "14:00" }],
    };
    const { result } = renderController({ staffing: templateStaffing });

    let saved: boolean | undefined;
    await act(async () => {
      saved = await actionsOf(result).onSaveCustom(date, requirements);
    });

    expect(saved).toBe(true);
    expect(mocks.saveDayCustomRequirements.mock.calls).toEqual([[{ recruitmentId, date, requirements }]]);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "この日の必要人数を保存しました" });
  });

  it("この日だけの必要人数の保存に失敗した場合は、エラーを知らせて失敗を返す", async () => {
    const error = new Error("rejected");
    mocks.saveDayCustomRequirements.mockRejectedValue(error);
    const { result } = renderController({ staffing: templateStaffing });

    let saved: boolean | undefined;
    await act(async () => {
      saved = await actionsOf(result).onSaveCustom(date, { kind: "time", bars: [] });
    });

    expect(saved).toBe(false);
    expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith(error);
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("型を当て直して必要人数が変わっても、編集中の勤務を消さず、そのまま保存する", async () => {
    const { result, rerender } = renderHook(
      ({ staffing }: { staffing: ShiftBoardStaffingData }) =>
        useShiftBoardPageController(data, recruitmentId, undefined, undefined, staffing),
      { wrapper: Scope, initialProps: { staffing: emptyStaffing } },
    );
    const initialShifts = result.current.viewModel.shiftForm.initialShifts;
    act(() => result.current.intents.onShiftsChange(initialShifts));
    // 未提出のスタッフへ、保存していない勤務を入れる。
    const edited = initialShifts.map((shift) =>
      shift.staffId === unsubmittedStaffId
        ? {
            ...shift,
            positions: [
              {
                id: "seg-manual",
                positionId: hallId,
                positionName: "ホール",
                color: "#0d9488",
                start: "09:00",
                end: "12:00",
              },
            ],
          }
        : shift,
    );
    act(() => result.current.intents.onShiftsChange(edited));

    await act(async () => {
      await actionsOf(result).onApplyTemplate([date], templateId);
    });
    // 型を当てたあとの必要人数が、queryの更新で届く。
    rerender({ staffing: templateStaffing });

    expect(mocks.save).not.toHaveBeenCalled();
    expect(result.current.viewModel.shiftForm.staffing?.days).toEqual([weekdayDay]);

    await act(async () => {
      result.current.intents.onSaveDraft();
    });

    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(
      mocks.save.mock.calls[0][0].assignments.map(
        (assignment: { staffId: string; startTime: string; endTime: string }) => [
          assignment.staffId,
          assignment.startTime,
          assignment.endTime,
        ],
      ),
    ).toEqual([
      [submittedStaffId, "10:00", "18:00"],
      [unsubmittedStaffId, "09:00", "12:00"],
    ]);
  });

  it("確定済みで必要人数を変えられない募集には、必要人数の操作を出さず、設定ページへの導線だけを出す", () => {
    const { result } = renderController({
      data: { ...data, recruitment: { ...data.recruitment, status: "confirmed", confirmedAt: 1 } },
      staffing: {
        ...templateStaffing,
        isLocked: true,
        days: [{ ...weekdayDay, source: "confirmed", templateId: null }],
      },
    });

    expect(result.current.viewModel.shiftForm.staffing?.isLocked).toBe(true);
    expect(Object.keys(result.current.viewModel.shiftForm.detailActions)).toEqual(["onOpenSetup"]);
  });

  it.each<[string, Partial<ShiftBoardData>]>([
    ["利用制限で書き込めない", { canWriteBusinessData: false, businessWriteBlockReason: "usageLimitExceeded" }],
    [
      "支払い結果の確認中で書き込めない",
      { canWriteBusinessData: false, businessWriteBlockReason: "paymentResultPending" },
    ],
  ])("%s場合は、必要人数の操作を出さず、設定ページへの導線だけを出す", (_label, overrides) => {
    const { result } = renderController({ data: { ...data, ...overrides }, staffing: emptyStaffing });

    expect(result.current.viewModel.isReadOnly).toBe(true);
    expect(Object.keys(result.current.viewModel.shiftForm.detailActions)).toEqual(["onOpenSetup"]);
  });

  it("募集条件が変わって再読み込みを案内している間は、必要人数の操作を出さない", () => {
    const { result, rerender } = renderHook(
      ({ current }: { current: ShiftBoardData }) =>
        useShiftBoardPageController(current, recruitmentId, undefined, undefined, emptyStaffing),
      { wrapper: Scope, initialProps: { current: data } },
    );
    expect(Object.keys(result.current.viewModel.shiftForm.detailActions).sort()).toEqual([
      "dayStaffingActions",
      "onOpenSetup",
    ]);

    rerender({ current: { ...data, recruitment: { ...data.recruitment, editVersion: 1 } } });

    expect(result.current.viewModel.isRecruitmentChanged).toBe(true);
    expect(Object.keys(result.current.viewModel.shiftForm.detailActions)).toEqual(["onOpenSetup"]);
  });

  it("設定ページへの導線は、この店舗の「シフト作成の設定」を組織を指定して開く", () => {
    const { result } = renderController({ staffing: emptyStaffing });

    act(() => result.current.viewModel.shiftForm.detailActions.onOpenSetup?.());

    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/manage/shops/$shopId/shift-setup",
      params: { shopId },
      search: { org: organizationId },
    });
  });

  it.each<[string, RenderOptions["wrapper"]]>([
    ["組織・店舗scopeがない", ({ children }) => children],
    ["組織・店舗scopeが別の店舗を指す", OtherShopScope],
  ])("%s利用箇所には、くわしく表示の操作を1つも出さない", (_label, wrapper) => {
    const { result } = renderController({
      staffing: { ...emptyStaffing, hasPreviousConfirmedRecruitment: true },
      wrapper,
    });

    expect(result.current.viewModel.shiftForm.detailActions).toEqual({});
  });
});

describe("新人だけの時間帯の確認事項", () => {
  const newcomerId = "staff-newcomer" as Id<"staffs">;
  // 提出済みの新人が10:00〜18:00にホール、提出済みの標準スタッフが10:00〜14:00にホールへ入る。
  const newcomerData: ShiftBoardData = {
    ...data,
    positions: [hall, kitchen],
    staffs: [
      { _id: submittedStaffId, name: "提出済み", isSubmitted: true, wasSubmittedAtDraft: false },
      { _id: newcomerId, name: "新人", isSubmitted: true, wasSubmittedAtDraft: false },
    ],
    requestedSlots: [
      { staffId: submittedStaffId, date, startTime: "10:00", endTime: "14:00" },
      { staffId: newcomerId, date, startTime: "10:00", endTime: "18:00" },
    ],
    shiftAssignments: [
      { staffId: submittedStaffId, date, startTime: "10:00", endTime: "14:00", positionId: hallId },
      { staffId: newcomerId, date, startTime: "10:00", endTime: "18:00", positionId: hallId },
    ],
  };
  const newcomerStaffing: ShiftBoardStaffingData = {
    ...emptyStaffing,
    // ホールでは新人、キッチンでは標準。
    staffProfiles: [{ staffId: newcomerId, positionSkills: [{ positionId: hallId, level: "newcomer" }] }],
  };
  const period = { date, positionId: hallId, scope: { kind: "time", start: "14:00", end: "18:00" } };
  const item = { key: `${date}-${hallId}-14:00`, date, label: "1/20(火) ホール 14:00〜18:00" };

  it("新人だけが残る時間帯を、日、ポジション、時間帯の単位で、シフト表と確定の確認へ渡す", () => {
    const { result } = renderInitialized({ data: newcomerData, staffing: newcomerStaffing });

    expect(result.current.viewModel.shiftForm.newcomerOnlyPeriods).toEqual([period]);
    expect(result.current.viewModel.confirmDialog.newcomerOnlyItems).toEqual([item]);
    // スタッフ1人に結び付く確認事項とは別に持つ。
    expect(result.current.viewModel.shiftForm.validationWarnings).toEqual([]);
  });

  it("新人だけの時間帯があっても、確定の確認を開ける", () => {
    const { result } = renderInitialized({ data: newcomerData, staffing: newcomerStaffing });

    act(() => result.current.intents.onConfirmRequest());

    expect(result.current.viewModel.shiftForm.validationIssues).toEqual([]);
    expect(result.current.viewModel.confirmDialog.isOpen).toBe(true);
    expect(result.current.viewModel.confirmDialog.newcomerOnlyItems).toEqual([item]);
  });

  it("新人だけの時間帯があっても、下書きを保存できる", async () => {
    const { result } = renderInitialized({ data: newcomerData, staffing: newcomerStaffing });

    await act(async () => {
      result.current.intents.onSaveDraft();
    });

    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({ title: "下書きを保存しました" });
  });

  it("勤務を編集すると、新人だけの時間帯を数え直す", () => {
    const { result } = renderInitialized({ data: newcomerData, staffing: newcomerStaffing });
    const withoutStandard = result.current.viewModel.shiftForm.initialShifts.map((shift) =>
      shift.staffId === submittedStaffId ? { ...shift, positions: [] } : shift,
    );

    act(() => result.current.intents.onShiftsChange(withoutStandard));

    expect(result.current.viewModel.confirmDialog.newcomerOnlyItems.map((entry) => entry.label)).toEqual([
      "1/20(火) ホール 10:00〜18:00",
    ]);
  });

  it("ホールで新人のスタッフが、標準のキッチンに1人で入る時間帯は出さない", () => {
    const { result } = renderInitialized({
      data: {
        ...newcomerData,
        shiftAssignments: [
          { staffId: submittedStaffId, date, startTime: "10:00", endTime: "14:00", positionId: hallId },
          { staffId: newcomerId, date, startTime: "10:00", endTime: "18:00", positionId: kitchenId },
        ],
      },
      staffing: newcomerStaffing,
    });

    expect(result.current.viewModel.shiftForm.newcomerOnlyPeriods).toEqual([]);
    expect(result.current.viewModel.confirmDialog.newcomerOnlyItems).toEqual([]);
  });

  it("新人の印がないスタッフだけの店舗では、何も出さない", () => {
    const { result } = renderInitialized({ data: newcomerData, staffing: emptyStaffing });

    expect(result.current.viewModel.shiftForm.newcomerOnlyPeriods).toEqual([]);
    expect(result.current.viewModel.confirmDialog.newcomerOnlyItems).toEqual([]);
  });

  it("確定済みのシフトを開き直しただけでは出さず、勤務を変えた日のものだけを出す", () => {
    const { result } = renderInitialized({
      data: { ...newcomerData, recruitment: { ...newcomerData.recruitment, status: "confirmed", confirmedAt: 1 } },
      staffing: newcomerStaffing,
    });
    expect(result.current.viewModel.confirmDialog.newcomerOnlyItems).toEqual([]);

    const edited = result.current.viewModel.shiftForm.initialShifts.map((shift) =>
      shift.staffId === submittedStaffId
        ? { ...shift, positions: shift.positions.map((position) => ({ ...position, end: "13:00" })) }
        : shift,
    );
    act(() => result.current.intents.onShiftsChange(edited));

    expect(result.current.viewModel.confirmDialog.newcomerOnlyItems.map((entry) => entry.label)).toEqual([
      "1/20(火) ホール 13:00〜18:00",
    ]);
  });
});
