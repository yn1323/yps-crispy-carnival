import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "@/src/domains/shift/constants";
import type { PositionType, ShiftData } from "@/src/domains/shift/types";
import { buildDayFulfillmentView, getShortageLevel, listFulfillmentTicks } from "./fulfillmentPresentation";
import type { ShiftFormStaffingDay } from "./types";

const hall: PositionType = { id: "hall", name: "ホール", color: "#60a5fa", isDefault: true };
const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#fb923c", isDefault: false };
const timeRange = { start: 9, end: 22, unit: 30 };

const shift = (staffId: string, position: PositionType, start: string, end: string): ShiftData => ({
  id: `shift-${staffId}`,
  staffId,
  staffName: staffId,
  date: "2026-05-21",
  requestedTime: null,
  positions: [
    { id: `seg-${staffId}`, positionId: position.id, positionName: position.name, color: position.color, start, end },
  ],
});

const day = (
  bars: Array<[position: PositionType, start: string, end: string, count?: number]>,
): ShiftFormStaffingDay => ({
  date: "2026-05-21",
  source: "weekday",
  templateId: "weekday",
  templateName: "平日",
  requirements: {
    kind: "time",
    bars: bars.flatMap(([position, startTime, endTime, count = 1]) =>
      Array.from({ length: count }, () => ({ positionId: position.id, startTime, endTime })),
    ),
  },
});

describe("getShortageLevel", () => {
  it.each([
    { shortage: 1, level: 1 },
    { shortage: 2, level: 2 },
    { shortage: 3, level: 3 },
    { shortage: 8, level: 3 },
  ])("$shortage人不足は濃さ$level", ({ shortage, level }) => {
    expect(getShortageLevel(shortage)).toBe(level);
  });
});

describe("listFulfillmentTicks", () => {
  const labels = (startHour: number, endHour: number) =>
    listFulfillmentTicks({ start: startHour * 60, end: endHour * 60 }).map((tick) => tick.label);

  it("両端が3時間ごとの時刻なら、両端も含める", () => {
    expect(labels(6, 24)).toEqual(["6", "9", "12", "15", "18", "21", "24"]);
  });

  it("両端が3時間ごとの時刻でなければ、内側の時刻だけを返す", () => {
    expect(labels(10, 22.5)).toEqual(["12", "15", "18", "21"]);
  });

  it("24時より後の時刻は「翌」を付ける", () => {
    expect(listFulfillmentTicks({ start: 17 * 60, end: 27 * 60 })).toEqual([
      { minutes: 18 * 60, label: "18" },
      { minutes: 21 * 60, label: "21" },
      { minutes: 24 * 60, label: "24" },
      { minutes: 27 * 60, label: "翌3" },
    ]);
  });
});

describe("buildDayFulfillmentView", () => {
  it("帯の範囲を必要人数の最初から最後までにし、時刻の軸は店舗の表示する時間に置き、区間に不足の人数と濃さを付ける", () => {
    const view = buildDayFulfillmentView({
      shifts: [shift("a", hall, "11:00", "15:00")],
      positions: [hall, kitchen],
      timeRange,
      day: day([
        [hall, "10:00", "13:00", 4],
        [hall, "13:00", "20:00"],
      ]),
    });

    expect(view).toEqual({
      // 必要は 4人×3時間 + 1人×7時間 = 19人時。満たすのは 1人×2時間 + 1人×2時間 = 4人時。
      percent: 21,
      range: { start: 10 * 60, end: 20 * 60 },
      // 時刻の軸は、スタッフのカードのバーと同じ、店舗の表示する時間（9〜22時）に置く。
      timelineRange: { start: 9 * 60, end: 22 * 60 },
      ticks: [
        { minutes: 540, label: "9" },
        { minutes: 720, label: "12" },
        { minutes: 900, label: "15" },
        { minutes: 1080, label: "18" },
        { minutes: 1260, label: "21" },
      ],
      hourLines: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map((hour) => hour * 60),
      showsPositionNames: true,
      // 必要人数を入れていないキッチンの帯は含めない。
      bands: [
        {
          positionId: "hall",
          name: "ホール",
          color: "#60a5fa",
          segments: [
            {
              key: "600",
              startMinutes: 600,
              endMinutes: 660,
              state: "shortage",
              shortageLevel: 3,
              label: "4",
              description: "10:00〜11:00 4人不足",
            },
            {
              key: "660",
              startMinutes: 660,
              endMinutes: 780,
              state: "shortage",
              shortageLevel: 3,
              label: "3",
              description: "11:00〜13:00 3人不足",
            },
            {
              key: "780",
              startMinutes: 780,
              endMinutes: 900,
              state: "even",
              shortageLevel: null,
              label: null,
              description: "13:00〜15:00 ちょうど",
            },
            {
              key: "900",
              startMinutes: 900,
              endMinutes: 1200,
              state: "shortage",
              shortageLevel: 1,
              label: "1",
              description: "15:00〜20:00 1人不足",
            },
          ],
        },
      ],
    });
  });

  it("ポジションが1つだけの店舗では、帯の上にポジション名を出さない", () => {
    const view = buildDayFulfillmentView({
      shifts: [],
      positions: [hall],
      timeRange,
      day: day([[hall, "09:00", "22:00"]]),
    });

    expect(view?.showsPositionNames).toBe(false);
    expect(view?.bands).toHaveLength(1);
  });

  it("店舗のポジションにないバーは、帯の範囲にも充足率にも入れない", () => {
    const view = buildDayFulfillmentView({
      shifts: [shift("a", hall, "11:00", "15:00")],
      positions: [hall],
      timeRange,
      day: day([
        [hall, "11:00", "15:00"],
        [kitchen, "09:00", "22:00", 2],
      ]),
    });

    expect(view?.range).toEqual({ start: 11 * 60, end: 15 * 60 });
    expect(view?.percent).toBe(100);
  });

  it("ポジションを分けていない店舗の帯は、仮の名前ではなく「全体」にする", () => {
    const unsplit: PositionType = { ...DEFAULT_POSITION, id: "default", isDefault: true };
    const view = buildDayFulfillmentView({
      shifts: [],
      positions: [unsplit],
      timeRange,
      day: day([[unsplit, "09:00", "22:00"]]),
    });

    expect(view?.bands.map((band) => band.name)).toEqual(["全体"]);
  });

  it("必要人数のない日と、時間指定ではない必要人数の日はnull", () => {
    const base = { shifts: [shift("a", hall, "11:00", "15:00")], positions: [hall], timeRange };

    expect(buildDayFulfillmentView({ ...base, day: undefined })).toBeNull();
    expect(buildDayFulfillmentView({ ...base, day: { ...day([]), requirements: null } })).toBeNull();
    expect(buildDayFulfillmentView({ ...base, day: day([]) })).toBeNull();
    expect(
      buildDayFulfillmentView({
        ...base,
        day: { ...day([]), requirements: { kind: "dateOnly", counts: [{ positionId: "hall", count: 2 }] } },
      }),
    ).toBeNull();
  });

  it("受付時間の外にだけ必要人数がある日はnull", () => {
    const view = buildDayFulfillmentView({
      shifts: [],
      positions: [hall],
      timeRange,
      day: day([[hall, "06:00", "09:00"]]),
    });

    expect(view).toBeNull();
  });
});
