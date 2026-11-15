import type { ExtractAtomValue } from "jotai";
import { createStore } from "jotai/vanilla";
import { describe, expect, it } from "vitest";
import type { PositionSegment, PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import { DEFAULT_TIME_PATTERN } from "@/src/domains/shop/submissionPattern";
import {
  applyShiftDraftsAtom,
  breakEditorTargetAtom,
  breakToolActiveAtom,
  changeShiftPositionAtom,
  clearShiftDraftPositionsAtom,
  deleteShiftPositionAtom,
  detailModeAtom,
  openBreakEditorForToolAtom,
  replaceShiftDraftsAtom,
  type ShiftFormStaffing,
  selectedPositionIdAtom,
  setShiftBreaksAtom,
  shiftConfigAtom,
  shiftsAtom,
  staffWorkTotalsAtom,
  toggleDateOnlyAssignmentAtom,
  toggleShiftTypeAssignmentAtom,
  updateShiftDraftsAtom,
  upsertShiftDraftAtom,
} from "./stores";

const staff: StaffType = { id: "staff-1", name: "山田", isSubmitted: true };
const position: PositionType = { id: "position-1", name: "ホール", color: "#0d9488", isDefault: true };
const date = "2026-07-14";

function createShiftStore() {
  const store = createStore();
  store.set(shiftConfigAtom, {
    shopId: "shop-1",
    staffs: [staff],
    positions: [position],
    dates: [date],
    timeRange: { start: 9, end: 18, unit: 30 },
    holidays: [],
    isReadOnly: false,
    submissionPattern: DEFAULT_TIME_PATTERN,
    displayMode: "request",
  });
  return store;
}

describe("ShiftForm draft intents", () => {
  it("日付選択の割当を追加・解除する", () => {
    const store = createShiftStore();

    store.set(toggleDateOnlyAssignmentAtom, { staff, date });
    expect(store.get(shiftsAtom)).toMatchObject([
      {
        staffId: staff.id,
        date,
        positions: [{ positionId: position.id, start: "09:00", end: "18:00" }],
      },
    ]);

    store.set(toggleDateOnlyAssignmentAtom, { staff, date });
    expect(store.get(shiftsAtom)[0]?.positions).toEqual([]);
  });

  it("勤務パターンの割当を追加・解除する", () => {
    const store = createShiftStore();
    const option = { id: "early", name: "早番", startTime: "09:00", endTime: "13:00" };

    store.set(toggleShiftTypeAssignmentAtom, { staff, date, option });
    expect(store.get(shiftsAtom)[0]?.positions).toMatchObject([
      { positionId: position.id, shiftTypeOptionId: option.id, start: option.startTime, end: option.endTime },
    ]);

    store.set(toggleShiftTypeAssignmentAtom, { staff, date, option });
    expect(store.get(shiftsAtom)[0]?.positions).toEqual([]);
  });

  it("新規割当には先頭ではなく実デフォルトポジションを使う", () => {
    const store = createShiftStore();
    const defaultPosition: PositionType = {
      id: "position-default",
      name: "標準シフト",
      color: "#3b82f6",
      isDefault: true,
    };
    store.set(shiftConfigAtom, {
      ...store.get(shiftConfigAtom),
      positions: [{ id: "position-other", name: "キッチン", color: "#f97316", isDefault: false }, defaultPosition],
    });

    store.set(toggleDateOnlyAssignmentAtom, { staff, date });

    expect(store.get(shiftsAtom)[0]?.positions[0]).toMatchObject({
      positionId: defaultPosition.id,
      positionName: defaultPosition.name,
      color: defaultPosition.color,
    });
  });

  it("読み取り専用または定休日では割当を変更しない", () => {
    const store = createShiftStore();
    const currentConfig = store.get(shiftConfigAtom);
    store.set(shiftConfigAtom, { ...currentConfig, holidays: [date] });

    store.set(toggleDateOnlyAssignmentAtom, { staff, date });
    expect(store.get(shiftsAtom)).toEqual([]);

    store.set(shiftConfigAtom, { ...currentConfig, isReadOnly: true });
    store.set(toggleShiftTypeAssignmentAtom, {
      staff,
      date,
      option: { id: "early", name: "早番", startTime: "09:00", endTime: "13:00" },
    });
    expect(store.get(shiftsAtom)).toEqual([]);
  });

  it("更新・ポジション削除・クリアをintent経由で反映する", () => {
    const store = createShiftStore();
    const shift: ShiftData = {
      id: "shift-1",
      staffId: staff.id,
      staffName: staff.name,
      date,
      requestedTime: null,
      positions: [
        {
          id: "segment-1",
          positionId: position.id,
          positionName: position.name,
          color: position.color,
          start: "09:00",
          end: "12:00",
        },
        {
          id: "segment-2",
          positionId: position.id,
          positionName: position.name,
          color: position.color,
          start: "12:00",
          end: "15:00",
        },
      ],
    };

    store.set(upsertShiftDraftAtom, shift);
    const afterDelete = store.set(deleteShiftPositionAtom, { shiftId: shift.id, positionId: "segment-1" });
    expect(afterDelete?.positions).toHaveLength(1);
    expect(store.get(shiftsAtom)[0]?.positions).toHaveLength(1);

    store.set(clearShiftDraftPositionsAtom, { staffId: staff.id, date });
    expect(store.get(shiftsAtom)[0]?.positions).toEqual([]);

    store.set(replaceShiftDraftsAtom, []);
    expect(store.get(shiftsAtom)).toEqual([]);
  });
});

// ==========================================
// くわしく表示（ポジション、休憩、合計）
// ==========================================
const kitchen: PositionType = { id: "position-2", name: "キッチン", color: "#f97316", isDefault: false };
const secondStaff: StaffType = { id: "staff-2", name: "佐藤", isSubmitted: false };
const nextDate = "2026-07-15";
const earlyOption = { id: "early", name: "早番", startTime: "09:00", endTime: "17:00", sortOrder: 0 };
const shortOption = { id: "short", name: "短時間", startTime: "17:00", endTime: "21:00", sortOrder: 1 };
const shiftTypePattern = { kind: "shiftType" as const, options: [earlyOption, shortOption] };
const dateOnlyPattern = { kind: "dateOnly" as const };
const breakRule = { minWorkMinutes: 360, breakMinutes: 60 };

type StoreConfig = Partial<ExtractAtomValue<typeof shiftConfigAtom>>;

const staffingWith = (rule: ShiftFormStaffing["breakRule"]): ShiftFormStaffing => ({
  dayTemplates: [],
  dayTemplateOverrides: [],
  breakRule: rule,
});

function createDetailStore(config: StoreConfig = {}, options: { detailMode?: boolean } = {}) {
  const store = createShiftStore();
  store.set(shiftConfigAtom, {
    ...store.get(shiftConfigAtom),
    staffs: [staff, secondStaff],
    positions: [position, kitchen],
    dates: [date, nextDate],
    ...config,
  });
  store.set(detailModeAtom, options.detailMode ?? true);
  return store;
}

const workSegment = (
  segmentPosition: PositionType,
  start: string,
  end: string,
  overrides: Partial<PositionSegment> = {},
): PositionSegment => ({
  id: `segment-${segmentPosition.id}-${start}`,
  positionId: segmentPosition.id,
  positionName: segmentPosition.name,
  color: segmentPosition.color,
  start,
  end,
  ...overrides,
});

const draft = (overrides: Partial<ShiftData> = {}): ShiftData => ({
  id: `shift-${staff.id}-${date}`,
  staffId: staff.id,
  staffName: staff.name,
  date,
  requestedTime: null,
  positions: [],
  ...overrides,
});

const positionIdsOf = (shifts: ShiftData[]) => shifts.map((shift) => shift.positions.map((item) => item.positionId));

describe("入れるポジションの選択", () => {
  describe("シンプル表示", () => {
    it("ポジションを選んでいても、日付選択の勤務は既定のポジションで入る", () => {
      const store = createDetailStore({ submissionPattern: dateOnlyPattern }, { detailMode: false });
      store.set(selectedPositionIdAtom, kitchen.id);

      store.set(toggleDateOnlyAssignmentAtom, { staff, date });

      expect(positionIdsOf(store.get(shiftsAtom))).toEqual([[position.id]]);
    });

    it("ポジションを選んでいても、勤務パターンは既定のポジションで入る", () => {
      const store = createDetailStore({ submissionPattern: shiftTypePattern }, { detailMode: false });
      store.set(selectedPositionIdAtom, kitchen.id);

      store.set(toggleShiftTypeAssignmentAtom, { staff, date, option: earlyOption });

      expect(positionIdsOf(store.get(shiftsAtom))).toEqual([[position.id]]);
    });

    it("別のポジションで入っている日付選択の勤務を押すと、入れ替えずに外す", () => {
      const store = createDetailStore({ submissionPattern: dateOnlyPattern }, { detailMode: false });
      store.set(replaceShiftDraftsAtom, [draft({ positions: [workSegment(kitchen, "09:00", "18:00")] })]);

      store.set(toggleDateOnlyAssignmentAtom, { staff, date });

      expect(positionIdsOf(store.get(shiftsAtom))).toEqual([[]]);
    });

    it("別のポジションで入っている勤務パターンを押すと、入れ替えずに外す", () => {
      const store = createDetailStore({ submissionPattern: shiftTypePattern }, { detailMode: false });
      store.set(replaceShiftDraftsAtom, [
        draft({ positions: [workSegment(kitchen, "09:00", "17:00", { shiftTypeOptionId: earlyOption.id })] }),
      ]);

      store.set(toggleShiftTypeAssignmentAtom, { staff, date, option: earlyOption });

      expect(positionIdsOf(store.get(shiftsAtom))).toEqual([[]]);
    });
  });

  describe("くわしく表示でポジションが2つ以上ある店舗", () => {
    it("日付選択の勤務を選んだポジションで入れ、別のポジションを選んで押すと入れ替え、同じポジションで押すと外す", () => {
      const store = createDetailStore({ submissionPattern: dateOnlyPattern });

      store.set(selectedPositionIdAtom, kitchen.id);
      store.set(toggleDateOnlyAssignmentAtom, { staff, date });
      expect(store.get(shiftsAtom)[0]?.positions).toMatchObject([
        { positionId: kitchen.id, positionName: kitchen.name, color: kitchen.color, start: "09:00", end: "18:00" },
      ]);

      store.set(selectedPositionIdAtom, position.id);
      store.set(toggleDateOnlyAssignmentAtom, { staff, date });
      expect(store.get(shiftsAtom)[0]?.positions).toMatchObject([
        { positionId: position.id, positionName: position.name, color: position.color, start: "09:00", end: "18:00" },
      ]);

      store.set(toggleDateOnlyAssignmentAtom, { staff, date });
      expect(positionIdsOf(store.get(shiftsAtom))).toEqual([[]]);
    });

    it("勤務パターンを選んだポジションで入れ、別のポジションを選んで押すと入れ替え、同じポジションで押すと外す", () => {
      const store = createDetailStore({ submissionPattern: shiftTypePattern });

      store.set(selectedPositionIdAtom, kitchen.id);
      store.set(toggleShiftTypeAssignmentAtom, { staff, date, option: earlyOption });
      expect(store.get(shiftsAtom)[0]?.positions).toMatchObject([
        { positionId: kitchen.id, positionName: kitchen.name, shiftTypeOptionId: earlyOption.id },
      ]);

      store.set(selectedPositionIdAtom, position.id);
      store.set(toggleShiftTypeAssignmentAtom, { staff, date, option: earlyOption });
      expect(store.get(shiftsAtom)[0]?.positions).toMatchObject([
        { positionId: position.id, positionName: position.name, shiftTypeOptionId: earlyOption.id },
      ]);

      store.set(toggleShiftTypeAssignmentAtom, { staff, date, option: earlyOption });
      expect(positionIdsOf(store.get(shiftsAtom))).toEqual([[]]);
    });

    it("ポジションを選んでいない間は、既定のポジションで入れる", () => {
      const store = createDetailStore({ submissionPattern: dateOnlyPattern, positions: [kitchen, position] });

      store.set(toggleDateOnlyAssignmentAtom, { staff, date });

      expect(positionIdsOf(store.get(shiftsAtom))).toEqual([[position.id]]);
    });

    it("店舗にないポジションを選んでいる場合は、既定のポジションで入れる", () => {
      const store = createDetailStore({ submissionPattern: dateOnlyPattern });
      store.set(selectedPositionIdAtom, "removed-position");

      store.set(toggleDateOnlyAssignmentAtom, { staff, date });

      expect(positionIdsOf(store.get(shiftsAtom))).toEqual([[position.id]]);
    });
  });

  it("くわしく表示でもポジションが1つの店舗では、別のポジションで残っている勤務を入れ替えずに外す", () => {
    const store = createDetailStore({ submissionPattern: dateOnlyPattern, positions: [position] });
    store.set(replaceShiftDraftsAtom, [draft({ positions: [workSegment(kitchen, "09:00", "18:00")] })]);

    store.set(toggleDateOnlyAssignmentAtom, { staff, date });

    expect(positionIdsOf(store.get(shiftsAtom))).toEqual([[]]);
  });
});

describe("休憩を選んでいる間の操作", () => {
  const withWork = () => [
    draft({ positions: [workSegment(position, "09:00", "17:00", { shiftTypeOptionId: earlyOption.id })] }),
    draft({ id: `shift-${staff.id}-${nextDate}`, date: nextDate }),
  ];

  it("日付選択で勤務のある日を押すと、割当を変えずにその日の休憩の編集を開く", () => {
    const store = createDetailStore({ submissionPattern: dateOnlyPattern });
    const shifts = withWork();
    store.set(replaceShiftDraftsAtom, shifts);
    store.set(breakToolActiveAtom, true);

    store.set(toggleDateOnlyAssignmentAtom, { staff, date });

    expect(store.get(shiftsAtom)).toBe(shifts);
    expect(store.get(breakEditorTargetAtom)).toEqual({ staffId: staff.id, date });
  });

  it("勤務パターンで勤務のある日を押すと、割当を変えずにその日の休憩の編集を開く", () => {
    const store = createDetailStore({ submissionPattern: shiftTypePattern });
    const shifts = withWork();
    store.set(replaceShiftDraftsAtom, shifts);
    store.set(breakToolActiveAtom, true);

    store.set(toggleShiftTypeAssignmentAtom, { staff, date, option: shortOption });

    expect(store.get(shiftsAtom)).toBe(shifts);
    expect(store.get(breakEditorTargetAtom)).toEqual({ staffId: staff.id, date });
  });

  it("勤務のない日を押しても、勤務を入れず、休憩の編集も開かない", () => {
    const store = createDetailStore({ submissionPattern: dateOnlyPattern });
    const shifts = withWork();
    store.set(replaceShiftDraftsAtom, shifts);
    store.set(breakToolActiveAtom, true);

    store.set(toggleDateOnlyAssignmentAtom, { staff, date: nextDate });
    store.set(toggleDateOnlyAssignmentAtom, { staff: secondStaff, date });

    expect(store.get(shiftsAtom)).toBe(shifts);
    expect(store.get(breakEditorTargetAtom)).toBeNull();
  });

  it("時間指定の画面から呼ぶ操作は、勤務のある日なら休憩の編集を開き、通常の操作を止めたことを返す", () => {
    const store = createDetailStore();
    store.set(replaceShiftDraftsAtom, withWork());
    store.set(breakToolActiveAtom, true);

    expect(store.set(openBreakEditorForToolAtom, { staffId: staff.id, date: nextDate })).toBe(true);
    expect(store.get(breakEditorTargetAtom)).toBeNull();

    expect(store.set(openBreakEditorForToolAtom, { staffId: staff.id, date })).toBe(true);
    expect(store.get(breakEditorTargetAtom)).toEqual({ staffId: staff.id, date });
  });

  it("休憩を選んでいなければ、通常の操作を止めない", () => {
    const store = createDetailStore();
    store.set(replaceShiftDraftsAtom, withWork());

    expect(store.set(openBreakEditorForToolAtom, { staffId: staff.id, date })).toBe(false);
    expect(store.get(breakEditorTargetAtom)).toBeNull();
  });

  it("シンプル表示では、休憩を選んだ状態が残っていても通常どおり割当を切り替える", () => {
    const store = createDetailStore({ submissionPattern: dateOnlyPattern }, { detailMode: false });
    store.set(replaceShiftDraftsAtom, withWork());
    store.set(breakToolActiveAtom, true);

    store.set(toggleDateOnlyAssignmentAtom, { staff, date });

    expect(positionIdsOf(store.get(shiftsAtom))).toEqual([[], []]);
    expect(store.get(breakEditorTargetAtom)).toBeNull();
    expect(store.set(openBreakEditorForToolAtom, { staffId: staff.id, date: nextDate })).toBe(false);
  });

  it("閲覧専用では、休憩を選んだ状態が残っていても休憩の編集を開かない", () => {
    const store = createDetailStore({ submissionPattern: dateOnlyPattern, isReadOnly: true });
    const shifts = withWork();
    store.set(replaceShiftDraftsAtom, shifts);
    store.set(breakToolActiveAtom, true);

    store.set(toggleDateOnlyAssignmentAtom, { staff, date });

    expect(store.get(shiftsAtom)).toBe(shifts);
    expect(store.get(breakEditorTargetAtom)).toBeNull();
    expect(store.set(openBreakEditorForToolAtom, { staffId: staff.id, date })).toBe(false);
  });
});

describe("休憩の決まりの初期値", () => {
  it("時間指定で決まりの長さ以上の勤務が新しくできた日に、勤務の中央へ休憩を入れる", () => {
    const store = createDetailStore({ staffing: staffingWith(breakRule) });

    store.set(upsertShiftDraftAtom, draft({ positions: [workSegment(position, "10:00", "18:00")] }));

    expect(store.get(shiftsAtom).map((shift) => shift.breaks)).toEqual([[{ start: "13:30", end: "14:30" }]]);
  });

  it("勤務のなかった日へ勤務を入れる更新でも、休憩を入れる", () => {
    const store = createDetailStore({ staffing: staffingWith(breakRule) });
    store.set(replaceShiftDraftsAtom, [draft(), draft({ id: "shift-other", staffId: secondStaff.id })]);

    store.set(updateShiftDraftsAtom, (current) =>
      current.map((shift) =>
        shift.staffId === staff.id ? { ...shift, positions: [workSegment(position, "10:00", "16:00")] } : shift,
      ),
    );

    expect(store.get(shiftsAtom).map((shift) => [shift.staffId, shift.breaks])).toEqual([
      [staff.id, [{ start: "12:30", end: "13:30" }]],
      [secondStaff.id, undefined],
    ]);
  });

  it("パターン選択で決まりの長さ以上の勤務パターンを入れた日に、休憩を入れる", () => {
    const store = createDetailStore({ submissionPattern: shiftTypePattern, staffing: staffingWith(breakRule) });

    store.set(toggleShiftTypeAssignmentAtom, { staff, date, option: earlyOption });

    expect(store.get(shiftsAtom).map((shift) => shift.breaks)).toEqual([[{ start: "12:30", end: "13:30" }]]);
  });

  it("シンプル表示では、休憩の決まりがあっても見えない休憩を入れない", () => {
    const store = createDetailStore(
      { submissionPattern: shiftTypePattern, staffing: staffingWith(breakRule) },
      { detailMode: false },
    );

    store.set(toggleShiftTypeAssignmentAtom, { staff, date, option: earlyOption });

    const shifts = store.get(shiftsAtom);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].positions).toHaveLength(1);
    expect(shifts[0].breaks).toBeUndefined();
  });

  it("決まりの長さに届かない勤務には入れない", () => {
    const store = createDetailStore({ submissionPattern: shiftTypePattern, staffing: staffingWith(breakRule) });

    store.set(toggleShiftTypeAssignmentAtom, { staff, date, option: shortOption });

    const shifts = store.get(shiftsAtom);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].positions).toHaveLength(1);
    expect(shifts[0].breaks).toBeUndefined();
  });

  it("日付選択では、休憩の決まりがあっても入れない", () => {
    const store = createDetailStore({ submissionPattern: dateOnlyPattern, staffing: staffingWith(breakRule) });

    store.set(toggleDateOnlyAssignmentAtom, { staff, date });

    const shifts = store.get(shiftsAtom);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].positions).toHaveLength(1);
    expect(shifts[0].breaks).toBeUndefined();
  });

  it.each([
    ["店舗の設定がない", undefined],
    ["休憩の決まりがない", staffingWith(null)],
  ])("%s場合は入れない", (_label, staffing) => {
    const store = createDetailStore({ staffing });

    store.set(upsertShiftDraftAtom, draft({ positions: [workSegment(position, "10:00", "18:00")] }));

    const shifts = store.get(shiftsAtom);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].positions).toHaveLength(1);
    expect(shifts[0].breaks).toBeUndefined();
  });

  it("すでに勤務のある日の勤務を変えても、休憩を入れ直さない", () => {
    const store = createDetailStore({ staffing: staffingWith(breakRule) });
    // 読み込んだ勤務、または担当者が休憩を消したあとの勤務を表す。
    const existing = draft({ positions: [workSegment(position, "10:00", "18:00")] });
    store.set(replaceShiftDraftsAtom, [existing]);

    store.set(upsertShiftDraftAtom, { ...existing, positions: [workSegment(position, "09:00", "19:00")] });

    const shifts = store.get(shiftsAtom);
    expect(shifts.map((shift) => shift.positions.map((item) => [item.start, item.end]))).toEqual([
      [["09:00", "19:00"]],
    ]);
    expect(shifts[0].breaks).toBeUndefined();
  });

  it("すでに勤務のある日へ勤務パターンを足しても、休憩を入れない", () => {
    const store = createDetailStore({ submissionPattern: shiftTypePattern, staffing: staffingWith(breakRule) });
    store.set(toggleShiftTypeAssignmentAtom, { staff, date, option: shortOption });

    store.set(toggleShiftTypeAssignmentAtom, { staff, date, option: earlyOption });

    const shifts = store.get(shiftsAtom);
    expect(shifts.map((shift) => shift.positions.map((item) => item.shiftTypeOptionId))).toEqual([
      [shortOption.id, earlyOption.id],
    ]);
    expect(shifts[0].breaks).toBeUndefined();
  });

  it("新しくできた勤務がすでに休憩を持っている場合は、その休憩を変えない", () => {
    const store = createDetailStore({ staffing: staffingWith(breakRule) });

    store.set(
      upsertShiftDraftAtom,
      draft({ positions: [workSegment(position, "10:00", "18:00")], breaks: [{ start: "11:00", end: "11:15" }] }),
    );

    expect(store.get(shiftsAtom).map((shift) => shift.breaks)).toEqual([[{ start: "11:00", end: "11:15" }]]);
  });
});

describe("勤務がなくなった日の休憩と仮の印", () => {
  const provisionalDraft = () =>
    draft({
      requestedTime: { start: "09:00", end: "18:00" },
      positions: [
        workSegment(position, "09:00", "12:00", { id: "segment-1" }),
        workSegment(kitchen, "12:00", "18:00", { id: "segment-2", shiftTypeOptionId: earlyOption.id }),
      ],
      breaks: [{ start: "13:00", end: "14:00" }],
      isProvisional: true,
    });
  const clearedDraft = { ...draft({ requestedTime: { start: "09:00", end: "18:00" } }) };

  it("勤務をまとめて消すと、休憩と仮の印も消える", () => {
    const store = createDetailStore();
    store.set(replaceShiftDraftsAtom, [provisionalDraft()]);

    store.set(clearShiftDraftPositionsAtom, { staffId: staff.id, date });

    expect(store.get(shiftsAtom)).toStrictEqual([clearedDraft]);
  });

  it("最後の勤務区間を削除すると、休憩と仮の印も消え、戻り値にも残らない", () => {
    const store = createDetailStore();
    const shift = provisionalDraft();
    store.set(replaceShiftDraftsAtom, [shift]);

    const afterFirst = store.set(deleteShiftPositionAtom, { shiftId: shift.id, positionId: "segment-1" });
    expect(afterFirst).toMatchObject({ breaks: [{ start: "13:00", end: "14:00" }], isProvisional: true });

    const afterLast = store.set(deleteShiftPositionAtom, { shiftId: shift.id, positionId: "segment-2" });
    expect(afterLast).toStrictEqual(clearedDraft);
    expect(store.get(shiftsAtom)).toStrictEqual([clearedDraft]);
  });

  it("日付選択の勤務を外すと、休憩と仮の印も消える", () => {
    const store = createDetailStore({ submissionPattern: dateOnlyPattern });
    store.set(replaceShiftDraftsAtom, [
      draft({
        positions: [workSegment(position, "09:00", "18:00")],
        breaks: [{ start: "12:00", end: "13:00" }],
        isProvisional: true,
      }),
    ]);

    store.set(toggleDateOnlyAssignmentAtom, { staff, date });

    expect(store.get(shiftsAtom)).toStrictEqual([draft()]);
  });

  it("最後の勤務パターンを外すと、休憩と仮の印も消える", () => {
    const store = createDetailStore({ submissionPattern: shiftTypePattern });
    store.set(replaceShiftDraftsAtom, [
      draft({
        positions: [workSegment(position, "09:00", "17:00", { shiftTypeOptionId: earlyOption.id })],
        breaks: [{ start: "12:00", end: "13:00" }],
        isProvisional: true,
      }),
    ]);

    store.set(toggleShiftTypeAssignmentAtom, { staff, date, option: earlyOption });

    expect(store.get(shiftsAtom)).toStrictEqual([draft()]);
  });

  it("勤務が残る変更では、休憩と仮の印を残す", () => {
    const store = createDetailStore();
    const shift = provisionalDraft();
    store.set(replaceShiftDraftsAtom, [shift]);

    store.set(upsertShiftDraftAtom, { ...shift, positions: [workSegment(position, "09:00", "18:00")] });

    expect(store.get(shiftsAtom)).toMatchObject([{ breaks: [{ start: "13:00", end: "14:00" }], isProvisional: true }]);
  });

  it("変えていないほかの日の休憩と仮の印は残す", () => {
    const store = createDetailStore();
    const other = { ...provisionalDraft(), id: "shift-other", staffId: secondStaff.id };
    store.set(replaceShiftDraftsAtom, [provisionalDraft(), other]);

    store.set(clearShiftDraftPositionsAtom, { staffId: staff.id, date });

    expect(store.get(shiftsAtom)).toStrictEqual([clearedDraft, other]);
  });
});

describe("休憩の置き換え（setShiftBreaksAtom）", () => {
  const worked = () => [
    draft({ positions: [workSegment(position, "10:00", "18:00")], breaks: [{ start: "12:00", end: "13:00" }] }),
    draft({ id: "shift-next", date: nextDate, positions: [workSegment(position, "10:00", "18:00")] }),
    draft({ id: "shift-other", staffId: secondStaff.id }),
  ];

  it("勤務のある日の休憩を、渡した休憩で置き換える", () => {
    const store = createDetailStore();
    const shifts = worked();
    store.set(replaceShiftDraftsAtom, shifts);
    const breaks = [
      { start: "11:00", end: "11:15" },
      { start: "14:00", end: "15:00" },
    ];

    store.set(setShiftBreaksAtom, { staffId: staff.id, date, breaks });

    expect(store.get(shiftsAtom)).toStrictEqual([{ ...shifts[0], breaks }, shifts[1], shifts[2]]);
  });

  it.each([
    ["空の配列", []],
    ["未指定", undefined],
  ])("%sを渡すと、その日の休憩を消す", (_label, breaks) => {
    const store = createDetailStore();
    const shifts = worked();
    store.set(replaceShiftDraftsAtom, shifts);

    store.set(setShiftBreaksAtom, { staffId: staff.id, date, breaks });

    const { breaks: _removed, ...withoutBreaks } = shifts[0];
    expect(store.get(shiftsAtom)).toStrictEqual([withoutBreaks, shifts[1], shifts[2]]);
  });

  it("勤務のない日には入れない", () => {
    const store = createDetailStore();
    const shifts = worked();
    store.set(replaceShiftDraftsAtom, shifts);

    store.set(setShiftBreaksAtom, { staffId: secondStaff.id, date, breaks: [{ start: "12:00", end: "13:00" }] });

    expect(store.get(shiftsAtom)).toStrictEqual(shifts);
  });

  it("シンプル表示でも置き換える", () => {
    const store = createDetailStore({}, { detailMode: false });
    store.set(replaceShiftDraftsAtom, worked());

    store.set(setShiftBreaksAtom, { staffId: staff.id, date: nextDate, breaks: [{ start: "12:00", end: "12:30" }] });

    expect(store.get(shiftsAtom).map((shift) => shift.breaks)).toEqual([
      [{ start: "12:00", end: "13:00" }],
      [{ start: "12:00", end: "12:30" }],
      undefined,
    ]);
  });
});

describe("勤務区間のポジションの変更（changeShiftPositionAtom）", () => {
  const twoSegments = () =>
    draft({
      positions: [
        workSegment(position, "09:00", "12:00", { id: "segment-1" }),
        workSegment(position, "13:00", "18:00", { id: "segment-2" }),
      ],
      breaks: [{ start: "15:00", end: "16:00" }],
    });

  it("選んだ区間だけを、指定したポジションの名前と色へ変える", () => {
    const store = createDetailStore();
    const shift = twoSegments();
    store.set(replaceShiftDraftsAtom, [shift]);

    store.set(changeShiftPositionAtom, { shiftId: shift.id, segmentId: "segment-2", positionId: kitchen.id });

    expect(store.get(shiftsAtom)).toStrictEqual([
      {
        ...shift,
        positions: [
          shift.positions[0],
          { ...shift.positions[1], positionId: kitchen.id, positionName: kitchen.name, color: kitchen.color },
        ],
      },
    ]);
  });

  it("変えた結果、同じポジションの区間が隣り合えば1つにまとめる", () => {
    const store = createDetailStore();
    const shift = draft({
      positions: [
        workSegment(position, "09:00", "13:00", { id: "segment-1" }),
        workSegment(kitchen, "13:00", "18:00", { id: "segment-2" }),
      ],
    });
    store.set(replaceShiftDraftsAtom, [shift]);

    store.set(changeShiftPositionAtom, { shiftId: shift.id, segmentId: "segment-2", positionId: position.id });

    expect(store.get(shiftsAtom)[0]?.positions).toEqual([{ ...shift.positions[0], end: "18:00" }]);
  });

  it("店舗にないポジションと、存在しない勤務・区間の指定では何も変えない", () => {
    const store = createDetailStore();
    const shifts = [twoSegments()];
    store.set(replaceShiftDraftsAtom, shifts);

    store.set(changeShiftPositionAtom, { shiftId: shifts[0].id, segmentId: "segment-1", positionId: "removed" });
    expect(store.get(shiftsAtom)).toBe(shifts);

    store.set(changeShiftPositionAtom, { shiftId: "missing-shift", segmentId: "segment-1", positionId: kitchen.id });
    store.set(changeShiftPositionAtom, { shiftId: shifts[0].id, segmentId: "missing", positionId: kitchen.id });
    expect(store.get(shiftsAtom)).toStrictEqual(shifts);
  });
});

describe("画面の外で組み立てた編集結果の取り込み（applyShiftDraftsAtom）", () => {
  it("渡した処理の結果を、現在の勤務としてそのまま取り込む", () => {
    const store = createDetailStore({ staffing: staffingWith(breakRule) });
    const current = [draft(), draft({ id: "shift-other", staffId: secondStaff.id })];
    store.set(replaceShiftDraftsAtom, current);
    const provisional = {
      ...current[1],
      positions: [workSegment(kitchen, "10:00", "18:00")],
      isProvisional: true,
    };

    let received: ShiftData[] | undefined;
    store.set(applyShiftDraftsAtom, (shifts) => {
      received = shifts;
      return [shifts[0], provisional];
    });

    expect(received).toBe(current);
    expect(store.get(shiftsAtom)).toStrictEqual([current[0], provisional]);
  });
});

describe("人ごとの合計（staffWorkTotalsAtom）", () => {
  const shifts = () => [
    draft({ positions: [workSegment(position, "10:00", "18:00")], breaks: [{ start: "12:00", end: "13:00" }] }),
    draft({ id: "shift-next", date: nextDate, positions: [workSegment(kitchen, "10:00", "14:30")] }),
    draft({ id: "shift-other", staffId: secondStaff.id }),
  ];

  it.each([
    ["時間指定", DEFAULT_TIME_PATTERN],
    ["パターン選択", shiftTypePattern],
  ])("%sでは、募集期間の全日について休憩を引いた時間を合計する", (_label, submissionPattern) => {
    const store = createDetailStore({ submissionPattern });
    store.set(replaceShiftDraftsAtom, shifts());

    expect(store.get(staffWorkTotalsAtom)).toEqual(new Map([[staff.id, { kind: "minutes", minutes: 690 }]]));
  });

  it("日付選択では、出勤日数を数える", () => {
    const store = createDetailStore({ submissionPattern: dateOnlyPattern });
    store.set(replaceShiftDraftsAtom, shifts());

    expect(store.get(staffWorkTotalsAtom)).toEqual(new Map([[staff.id, { kind: "days", days: 2 }]]));
  });

  it("編集のたびに合計を更新する", () => {
    const store = createDetailStore();
    store.set(replaceShiftDraftsAtom, shifts());

    store.set(setShiftBreaksAtom, { staffId: staff.id, date, breaks: [] });
    store.set(clearShiftDraftPositionsAtom, { staffId: staff.id, date: nextDate });

    expect(store.get(staffWorkTotalsAtom)).toEqual(new Map([[staff.id, { kind: "minutes", minutes: 480 }]]));
  });
});

describe("閲覧専用のくわしく表示", () => {
  it("休憩の置き換え、ポジションの変更、編集結果の取り込み、勤務の更新と削除のどれでも勤務を変えない", () => {
    const store = createDetailStore({ isReadOnly: true, staffing: staffingWith(breakRule) });
    const shift = draft({
      positions: [
        workSegment(position, "09:00", "12:00", { id: "segment-1" }),
        workSegment(position, "13:00", "18:00", { id: "segment-2" }),
      ],
      breaks: [{ start: "15:00", end: "16:00" }],
      isProvisional: true,
    });
    const shifts = [shift];
    store.set(replaceShiftDraftsAtom, shifts);
    store.set(selectedPositionIdAtom, kitchen.id);

    store.set(setShiftBreaksAtom, { staffId: staff.id, date, breaks: [] });
    store.set(changeShiftPositionAtom, { shiftId: shift.id, segmentId: "segment-1", positionId: kitchen.id });
    store.set(applyShiftDraftsAtom, () => []);
    store.set(upsertShiftDraftAtom, { ...shift, positions: [] });
    store.set(clearShiftDraftPositionsAtom, { staffId: staff.id, date });
    const deleted = store.set(deleteShiftPositionAtom, { shiftId: shift.id, positionId: "segment-1" });

    expect(deleted).toBeNull();
    expect(store.get(shiftsAtom)).toBe(shifts);
  });
});
