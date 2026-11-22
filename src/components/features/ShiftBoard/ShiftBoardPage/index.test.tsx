// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftBoardData } from "../types";
import type { ShiftBoardPageViewProps } from "./types";

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  blockerOptions: null as null | { shouldBlockFn: () => boolean },
  blocker: { status: "idle", reset: vi.fn(), proceed: vi.fn() },
  view: null as null | ShiftBoardPageViewProps,
}));

vi.mock("@tanstack/react-router", () => ({
  useBlocker: (options: { shouldBlockFn: () => boolean }) => {
    mocks.blockerOptions = options;
    return mocks.blocker;
  },
  useNavigate: () => vi.fn(),
}));
vi.mock("convex/react", () => ({ useConvex: () => ({ query: vi.fn() }) }));
vi.mock("@/convex/_generated/api", () => ({
  api: {
    shiftBoard: {
      mutations: {
        saveShiftAssignments: "saveShiftAssignments",
        confirmRecruitment: "confirmRecruitment",
        switchShiftDetailMode: "switchShiftDetailMode",
        setShiftStaffSortMode: "setShiftStaffSortMode",
      },
      queries: { getProvisionalAssignments: "getProvisionalAssignments" },
    },
    shiftSetup: { mutations: { applyDayTemplateToDates: "applyDayTemplateToDates" } },
  },
}));
vi.mock("@/src/hooks/useShopMutation", () => ({ useShopMutation: () => mocks.mutation }));
vi.mock("@/src/components/shared/feedback", () => ({ showErrorToast: vi.fn(), showSuccessToast: vi.fn() }));
vi.mock("@/src/components/ui/toaster", () => ({ toaster: { create: vi.fn() } }));
// 画面の中身は描かず、controllerがViewへ渡した値だけを受け取る。
vi.mock("./ShiftBoardPageView", () => ({
  ShiftBoardPageView: (props: ShiftBoardPageViewProps) => {
    mocks.view = props;
    return null;
  },
}));

import { ShiftBoardPage } from ".";

const recruitmentId = "recruitment-a" as Id<"recruitments">;
const staffId = "staff-a" as Id<"staffs">;
const date = "2099-01-20";

// 「シンプル」を選んでいる店舗。希望が1件あり、開くと希望から勤務の候補ができる。
const data: ShiftBoardData = {
  shopId: "shop-a" as Id<"shops">,
  shiftDetailMode: false,
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
  staffs: [{ _id: staffId, name: "提出済み", isSubmitted: true, wasSubmittedAtDraft: false }],
  requestedSlots: [{ staffId, date, startTime: "10:00", endTime: "18:00" }],
  requestedDates: [],
  shiftAssignments: [],
  positions: [{ _id: "position-hall" as Id<"positions">, name: "ホール", color: "#60a5fa", isDefault: true }],
  timeRange: { start: 9, end: 22, unit: 30 },
};

function currentView() {
  if (!mocks.view) throw new Error("シフト表が描画されていません");
  return mocks.view;
}

function workTimes() {
  return currentView().viewModel.shiftForm.initialShifts.flatMap((shift) =>
    shift.positions.map((position) => [position.start, position.end]),
  );
}

/** ShiftFormのマウント後と同じく初期の勤務を受け取り、そのあと勤務の終了を17:00へ変える。 */
function editShift() {
  const { viewModel, intents } = currentView();
  const { initialShifts } = viewModel.shiftForm;
  act(() => intents.onShiftsChange(initialShifts));
  act(() =>
    intents.onShiftsChange(
      initialShifts.map((shift) => ({
        ...shift,
        positions: shift.positions.map((position) => ({ ...position, end: "17:00" })),
      })),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mutation.mockResolvedValue(null);
  mocks.blockerOptions = null;
  mocks.view = null;
});

describe("店舗が選んだ表示（シンプル / くわしく）が変わったデータを受けたシフト表", () => {
  it("選んだ表示で開き直し、編集中の勤務を持ち越さない", () => {
    const { rerender } = render(<ShiftBoardPage data={data} recruitmentId={recruitmentId} />);
    expect(currentView().viewModel.shiftForm.initialDetailMode).toBe(false);
    expect(workTimes()).toEqual([["10:00", "18:00"]]);
    editShift();
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(true);

    // 表示の切り替えが保存されると、表示が変わったデータが届く。
    rerender(<ShiftBoardPage data={{ ...data, shiftDetailMode: true }} recruitmentId={recruitmentId} />);

    // 「くわしく」は希望から勤務の候補を作らないため、空で開き直す。
    expect(currentView().viewModel.shiftForm.initialDetailMode).toBe(true);
    expect(workTimes()).toEqual([]);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(false);
  });

  it("表示が変わらないデータの更新では開き直さず、編集中の勤務を保つ", () => {
    const { rerender } = render(<ShiftBoardPage data={data} recruitmentId={recruitmentId} />);
    editShift();

    // 編集中に、下書きの保存日時だけが変わったデータが届く。
    rerender(
      <ShiftBoardPage
        data={{ ...data, recruitment: { ...data.recruitment, draftSavedAt: 1 } }}
        recruitmentId={recruitmentId}
      />,
    );

    expect(currentView().viewModel.shiftForm.initialDetailMode).toBe(false);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(true);
  });
});
