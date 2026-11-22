// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { NewcomerOnlyPeriod } from "@/src/domains/shift/staffing";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import { DEFAULT_TIME_PATTERN } from "@/src/domains/shop/submissionPattern";
import {
  detailModeAtom,
  selectedDateAtom,
  shiftConfigAtom,
  shiftsAtom,
  upsertShiftDraftAtom,
  warningCountByDateAtom,
} from "../stores";
import type { ShiftFormStaffing } from "../types";
import { useShiftFormInit } from "./useShiftFormInit";

type InitParams = Parameters<typeof useShiftFormInit>[0];

const staff: StaffType = { id: "staff-1", name: "山田", isSubmitted: true };
const hall: PositionType = { id: "hall", name: "ホール", color: "#60a5fa", isDefault: true };
const date = "2026-07-14";
const nextDate = "2026-07-15";

const shiftOf = (start: string, end: string): ShiftData => ({
  id: `shift-${staff.id}-${date}`,
  staffId: staff.id,
  staffName: staff.name,
  date,
  requestedTime: null,
  positions: [{ id: "segment-1", positionId: hall.id, positionName: hall.name, color: hall.color, start, end }],
});

const period = (targetDate: string): NewcomerOnlyPeriod => ({
  date: targetDate,
  positionId: hall.id,
  scope: { kind: "time", start: "09:00", end: "12:00" },
});

const baseParams: InitParams = {
  shopId: "shop-1",
  staffs: [staff],
  positions: [hall],
  initialShifts: [shiftOf("09:00", "12:00")],
  dates: [date, nextDate],
  timeRange: { start: 9, end: 18, unit: 30 },
  submissionPattern: DEFAULT_TIME_PATTERN,
};

const renderInit = (params: Partial<InitParams> = {}) => {
  const store = createStore();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  const view = renderHook((props: InitParams) => useShiftFormInit(props), {
    wrapper,
    initialProps: { ...baseParams, ...params },
  });
  return { store, rerender: (next: Partial<InitParams>) => view.rerender({ ...baseParams, ...next }) };
};

describe("useShiftFormInit", () => {
  it("開いた時点で、渡した勤務、期間の最初の日、くわしく表示の初期値を取り込む", () => {
    const { store } = renderInit({ initialDetailMode: true });

    expect(store.get(shiftsAtom)).toEqual(baseParams.initialShifts);
    expect(store.get(selectedDateAtom)).toBe(date);
    expect(store.get(detailModeAtom)).toBe(true);
  });

  it("くわしく表示の初期値を渡さなければ、シンプル表示で開く", () => {
    const { store } = renderInit();

    expect(store.get(detailModeAtom)).toBe(false);
  });

  it("開いたあとで勤務とくわしく表示の初期値が渡し直されても、編集中の勤務と表示を変えない", () => {
    const { store, rerender } = renderInit({ initialDetailMode: true });
    const edited = shiftOf("09:00", "17:00");
    store.set(upsertShiftDraftAtom, edited);

    rerender({ initialShifts: [shiftOf("13:00", "15:00")], initialDetailMode: false });

    expect(store.get(shiftsAtom)).toEqual([edited]);
    expect(store.get(detailModeAtom)).toBe(true);
  });

  it("見習いだけの時間帯は、渡し直すたびに取り込み、くわしく表示の日付の確認事項の件数へ足す。渡さなくなると件数から外す", () => {
    const { store, rerender } = renderInit({ initialDetailMode: true, newcomerOnlyPeriods: [period(date)] });
    expect([...store.get(warningCountByDateAtom)]).toEqual([[date, 1]]);

    rerender({ initialDetailMode: true, newcomerOnlyPeriods: [period(date), period(nextDate)] });
    expect([...store.get(warningCountByDateAtom)]).toEqual([
      [date, 1],
      [nextDate, 1],
    ]);

    rerender({ initialDetailMode: true });
    expect([...store.get(warningCountByDateAtom)]).toEqual([]);
  });

  it("日ごとの必要人数と閲覧専用の指定は、渡し直すたびに取り込む", () => {
    const { store, rerender } = renderInit();
    expect(store.get(shiftConfigAtom)).toMatchObject({ isReadOnly: false, staffing: undefined });

    const staffing: ShiftFormStaffing = {
      breakRule: null,
      isLocked: true,
      templates: [],
      days: [{ date, source: "confirmed", templateId: null, templateName: null, requirements: null }],
    };
    rerender({ staffing, isReadOnly: true });

    expect(store.get(shiftConfigAtom)).toMatchObject({ isReadOnly: true, staffing });
  });
});
