import { createStore } from "jotai/vanilla";
import { describe, expect, it } from "vitest";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import { DEFAULT_TIME_PATTERN } from "@/src/domains/shop/submissionPattern";
import {
  clearShiftDraftPositionsAtom,
  deleteShiftPositionAtom,
  replaceShiftDraftsAtom,
  shiftConfigAtom,
  shiftsAtom,
  toggleDateOnlyAssignmentAtom,
  toggleShiftTypeAssignmentAtom,
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
  it("日ごとの割当を追加・解除する", () => {
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

  it("勤務区分の割当を追加・解除する", () => {
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
