import { describe, expect, it } from "vitest";
import { timeToMinutes } from "../../_lib/time";
import { getMinutesOverNoBreakSpan, getRequiredBreakMinutes } from "./breakStandard";
import { buildTimeAssignments } from "./timeAssignments";
import type { AutoCreateInput, AutoCreateSkillLevel, AutoCreateStaff } from "./types";

const DAY1 = "2026-08-17";
const DAY2 = "2026-08-18";

const staff = (id: string, skills: Record<string, AutoCreateSkillLevel> = {}): AutoCreateStaff => ({
  id,
  positionSkills: Object.entries(skills).map(([positionId, level]) => ({ positionId, level })),
});

const timeInput = (overrides: Partial<AutoCreateInput> = {}): AutoCreateInput => ({
  pattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  periodStart: DAY1,
  dates: [DAY1],
  staffs: [],
  positionIds: ["hall", "kitchen"],
  requestedSlots: [],
  requestedDates: [],
  days: [],
  history: null,
  includesBreaks: true,
  ...overrides,
});

/** `count`人分のバーを作る。 */
const bars = (positionId: string, startTime: string, endTime: string, count = 1) =>
  Array.from({ length: count }, () => ({ positionId, startTime, endTime }));

const timeDay = (date: string, dayBars: ReturnType<typeof bars>) => ({
  date,
  requirements: { kind: "time" as const, bars: dayBars },
});

const request = (staffId: string, date: string, startTime: string, endTime: string) => ({
  staffId,
  date,
  startTime,
  endTime,
});

type Result = ReturnType<typeof buildTimeAssignments>;

/** 作った勤務を「スタッフ 開始-終了 ポジション / … 休憩 開始-終了」の文字列にする。 */
const summarize = (result: Result) =>
  result.shifts.map((shift) => {
    const segments = shift.segments
      .map((segment) => `${segment.startTime}-${segment.endTime} ${segment.positionId}`)
      .join(" / ");
    const breaks = shift.breaks.map((item) => ` 休憩 ${item.startTime}-${item.endTime}`).join("");
    return `${shift.staffId} ${segments}${breaks}`;
  });

const findShift = (result: Result, staffId: string) => result.shifts.find((shift) => shift.staffId === staffId);

describe("getRequiredBreakMinutes", () => {
  it("開始から終了までが6時間45分より短い勤務には、休憩を入れない", () => {
    expect(getRequiredBreakMinutes(6 * 60)).toBe(0);
    expect(getRequiredBreakMinutes(6 * 60 + 30)).toBe(0);
  });

  it("6時間45分以上で、9時間より短い勤務には、45分を入れる", () => {
    expect(getRequiredBreakMinutes(6 * 60 + 45)).toBe(45);
    expect(getRequiredBreakMinutes(8 * 60 + 45)).toBe(45);
  });

  it("9時間以上の勤務には、1時間を入れる", () => {
    expect(getRequiredBreakMinutes(9 * 60)).toBe(60);
    expect(getRequiredBreakMinutes(13 * 60)).toBe(60);
  });
});

describe("getMinutesOverNoBreakSpan", () => {
  it("6時間までの勤務と、6時間45分以上の勤務は、縮める対象にしない", () => {
    expect(getMinutesOverNoBreakSpan(6 * 60)).toBe(0);
    expect(getMinutesOverNoBreakSpan(6 * 60 + 45)).toBe(0);
    expect(getMinutesOverNoBreakSpan(9 * 60)).toBe(0);
  });

  it("6時間を超えて6時間45分より短い勤務は、6時間を超えている長さを返す", () => {
    expect(getMinutesOverNoBreakSpan(6 * 60 + 15)).toBe(15);
    expect(getMinutesOverNoBreakSpan(6 * 60 + 30)).toBe(30);
  });
});

describe("buildTimeAssignments", () => {
  it("希望の時間を、必要人数のある時間に合わせて切る", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "10:00", "18:00")],
        days: [timeDay(DAY1, bars("hall", "11:00", "15:00"))],
      }),
    );

    expect(result).toEqual({
      shifts: [
        {
          staffId: "a",
          date: DAY1,
          segments: [{ startTime: "11:00", endTime: "15:00", positionId: "hall" }],
          breaks: [],
        },
      ],
      hasShortage: false,
      skippedDates: [],
    });
  });

  it("希望者が必要人数より多い時間は、必要人数ちょうどで止める", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b"), staff("c")],
        requestedSlots: ["a", "b", "c"].map((staffId) => request(staffId, DAY1, "10:00", "14:00")),
        days: [timeDay(DAY1, bars("hall", "10:00", "14:00", 2))],
      }),
    );

    expect(result.shifts).toHaveLength(2);
    expect(result.shifts.every((shift) => shift.segments.length === 1)).toBe(true);
    expect(result.hasShortage).toBe(false);
  });

  it("希望のない時間、対象でないスタッフ、担当外のポジションには入れず、不足を残す", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b", { hall: "unavailable" })],
        requestedSlots: [
          // aの希望は必要人数のある時間と重ならない。
          request("a", DAY1, "15:00", "20:00"),
          request("b", DAY1, "10:00", "14:00"),
          // 「x」は提出済みのシフト対象スタッフではない。
          request("x", DAY1, "10:00", "14:00"),
        ],
        days: [timeDay(DAY1, bars("hall", "10:00", "14:00"))],
      }),
    );

    expect(result.shifts).toEqual([]);
    expect(result.hasShortage).toBe(true);
  });

  it("2時間より短い勤務は作らない", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "10:00", "18:00")],
        days: [timeDay(DAY1, bars("hall", "10:00", "11:30"))],
      }),
    );

    expect(result.shifts).toEqual([]);
    expect(result.hasShortage).toBe(true);
  });

  it("希望が2時間より短い日は、希望どおりの長さで入れられる場合だけ作る", () => {
    const result = buildTimeAssignments(
      timeInput({
        dates: [DAY1, DAY2],
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "10:00", "11:30"), request("a", DAY2, "10:00", "11:30")],
        days: [timeDay(DAY1, bars("hall", "09:00", "13:00")), timeDay(DAY2, bars("hall", "10:00", "11:00"))],
      }),
    );

    // DAY2は希望の一部（1時間）しか必要人数がないため、作らない。
    expect(summarize(result)).toEqual(["a 10:00-11:30 hall"]);
    expect(result.shifts[0].date).toBe(DAY1);
  });

  it("1日に離れた2つの勤務は作らない", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "09:00", "22:00")],
        days: [timeDay(DAY1, [...bars("hall", "10:00", "13:00"), ...bars("hall", "17:00", "21:00")])],
      }),
    );

    expect(result.shifts).toHaveLength(1);
    expect(result.shifts[0].segments).toHaveLength(1);
    expect(result.hasShortage).toBe(true);
  });

  it("希望者が多い日は、1人が希望いっぱいを取らず、必要な時間を分け合う", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("early1"), staff("early2"), staff("late1"), staff("late2")],
        requestedSlots: [
          request("early1", DAY1, "09:00", "21:00"),
          request("early2", DAY1, "09:00", "21:00"),
          request("late1", DAY1, "13:00", "21:00"),
          request("late2", DAY1, "13:00", "21:00"),
        ],
        // 必要な時間は2人×12時間で、4人で分けると1人6時間になる。
        days: [timeDay(DAY1, bars("hall", "09:00", "21:00", 2))],
      }),
    );

    expect(summarize(result)).toEqual([
      "early1 09:00-15:00 hall",
      "early2 09:00-15:00 hall",
      "late1 15:00-21:00 hall",
      "late2 15:00-21:00 hall",
    ]);
    expect(result.hasShortage).toBe(false);
  });

  it("希望者が足りない日は上限を置かず、希望いっぱいまで入れる", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b")],
        requestedSlots: [request("a", DAY1, "09:00", "21:00"), request("b", DAY1, "09:00", "21:00")],
        days: [timeDay(DAY1, bars("hall", "09:00", "21:00", 2))],
      }),
    );

    expect(result.shifts.map((shift) => `${shift.segments[0].startTime}-${shift.segments[0].endTime}`)).toEqual([
      "09:00-21:00",
      "09:00-21:00",
    ]);
  });

  it("分け合うと残りが3時間に満たない場合は分けず、だれが入るかを勤務時間の公平で日ごとに替える", () => {
    const result = buildTimeAssignments(
      timeInput({
        dates: [DAY1, DAY2],
        staffs: [staff("a"), staff("b")],
        requestedSlots: [DAY1, DAY2].flatMap((date) => [
          request("a", date, "10:00", "15:00"),
          request("b", date, "10:00", "15:00"),
        ]),
        days: [DAY1, DAY2].map((date) => timeDay(date, bars("hall", "10:00", "15:00"))),
      }),
    );

    // 5時間を2人で分けると、3時間と2時間になる。残りが3時間に満たないため刻まず、1人が5時間入る。2日で1日ずつになる。
    expect(result.shifts.map((shift) => `${shift.segments[0].startTime}-${shift.segments[0].endTime}`)).toEqual([
      "10:00-15:00",
      "10:00-15:00",
    ]);
    expect(result.shifts.map((shift) => shift.staffId).sort()).toEqual(["a", "b"]);
  });

  it("分け合った勤務がどちらも3時間以上になる場合は、3時間ずつに分ける", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b")],
        requestedSlots: [request("a", DAY1, "10:00", "16:00"), request("b", DAY1, "10:00", "16:00")],
        days: [timeDay(DAY1, bars("hall", "10:00", "16:00"))],
      }),
    );

    expect(result.shifts.map((shift) => `${shift.segments[0].startTime}-${shift.segments[0].endTime}`).sort()).toEqual([
      "10:00-13:00",
      "13:00-16:00",
    ]);
    expect(result.shifts.map((shift) => shift.staffId).sort()).toEqual(["a", "b"]);
    expect(result.hasShortage).toBe(false);
  });

  it("分け合った残りが、その人の希望の外へ続く足りない時間とつながって3時間以上になる場合は、分ける", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b")],
        requestedSlots: [request("a", DAY1, "10:00", "15:00"), request("b", DAY1, "12:00", "16:00")],
        days: [timeDay(DAY1, bars("hall", "10:00", "16:00"))],
      }),
    );

    // aが希望いっぱいの15時まで入ると、bには1時間しか残らず、bは入れない。aを13時までにすると、bが3時間入れる。
    expect(summarize(result)).toEqual(["a 10:00-13:00 hall", "b 13:00-16:00 hall"]);
    expect(result.hasShortage).toBe(false);
  });

  it("希望者の多い時間帯だけを希望した人は、その時間帯で分け合い、1人が希望いっぱいを取らない", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("early"), staff("late1"), staff("late2")],
        requestedSlots: [
          request("early", DAY1, "09:00", "21:00"),
          request("late1", DAY1, "15:00", "21:00"),
          request("late2", DAY1, "15:00", "21:00"),
        ],
        days: [timeDay(DAY1, bars("hall", "09:00", "21:00"))],
      }),
    );

    // 1日を3人で均等に分けると4時間ずつだが、15時からの6時間には3人の希望が重なる。
    // 遅い時間だけを希望した2人は3時間ずつにし、早い時間はそこにしか入れない1人が埋める。
    expect(result.shifts.map((shift) => `${shift.segments[0].startTime}-${shift.segments[0].endTime}`).sort()).toEqual([
      "09:00-15:00",
      "15:00-18:00",
      "18:00-21:00",
    ]);
    expect(findShift(result, "early")?.segments).toEqual([
      { startTime: "09:00", endTime: "15:00", positionId: "hall" },
    ]);
    expect(result.hasShortage).toBe(false);
  });

  it("時間帯の取り分は30分単位に切り捨てて、上限にする", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b"), staff("c")],
        requestedSlots: ["a", "b", "c"].map((staffId) => request(staffId, DAY1, "10:00", "20:00")),
        days: [timeDay(DAY1, bars("hall", "10:00", "20:00"))],
      }),
    );

    // 10時間を3人で分けると3時間20分ずつになる。切り捨てた3時間を上限にし、最後の1人が残りの4時間に入る。
    expect(result.shifts.map((shift) => `${shift.segments[0].startTime}-${shift.segments[0].endTime}`).sort()).toEqual([
      "10:00-13:00",
      "13:00-16:00",
      "16:00-20:00",
    ]);
    expect(result.hasShortage).toBe(false);
  });

  it("上限に合わせて縮める位置は、希望者の少ない時間へ寄せる", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("long"), staff("early1"), staff("early2"), staff("late")],
        requestedSlots: [
          request("long", DAY1, "09:00", "21:00"),
          request("early1", DAY1, "09:00", "15:00"),
          request("early2", DAY1, "09:00", "15:00"),
          request("late", DAY1, "15:00", "21:00"),
        ],
        days: [timeDay(DAY1, bars("hall", "09:00", "21:00"))],
      }),
    );

    // 15時までは3人、15時からは2人が希望している。長く希望した人を15時からの時間へ寄せると、4人とも3時間ずつ入れる。
    expect(result.shifts.map((shift) => `${shift.segments[0].startTime}-${shift.segments[0].endTime}`).sort()).toEqual([
      "09:00-12:00",
      "12:00-15:00",
      "15:00-18:00",
      "18:00-21:00",
    ]);
    expect(result.shifts.map((shift) => shift.staffId).sort()).toEqual(["early1", "early2", "late", "long"]);
    expect(result.hasShortage).toBe(false);
  });

  it("希望者の多い時間だけを希望した人も、期間を通して取り分どおりに入れる", () => {
    const dates = Array.from({ length: 12 }, (_, index) => `2026-08-${String(index + 1).padStart(2, "0")}`);
    const windows: Record<string, [string, string]> = {
      morning: ["10:00", "13:00"],
      both: ["10:00", "16:00"],
      afternoon1: ["13:00", "16:00"],
      afternoon2: ["13:00", "16:00"],
    };
    const result = buildTimeAssignments(
      timeInput({
        dates,
        staffs: Object.keys(windows).map((id) => staff(id)),
        requestedSlots: dates.flatMap((date) =>
          Object.entries(windows).map(([staffId, [startTime, endTime]]) => request(staffId, date, startTime, endTime)),
        ),
        days: dates.map((date) => timeDay(date, bars("hall", "10:00", "16:00"))),
      }),
    );

    // 10時から13時は、「morning」と「both」の2人で1人分を希望している。「morning」の取り分は半分で、12日のうち6日に入る。
    // 目安を希望した時間で数えると、希望の長い「both」の目安が大きくなり、「morning」は5日になる。
    expect(result.shifts.filter((shift) => shift.staffId === "morning")).toHaveLength(6);
    expect(result.shifts).toHaveLength(24);
    expect(result.hasShortage).toBe(false);
  });

  it("勤務が入らない日が続いた人を、目安に対して入った量が多くても先に選ぶ", () => {
    const dates = [DAY1, DAY2, "2026-08-19", "2026-08-20"];
    const result = buildTimeAssignments(
      timeInput({
        dates,
        staffs: [staff("often"), staff("seldom")],
        requestedSlots: dates.flatMap((date) => [
          request("often", date, "10:00", "13:00"),
          request("seldom", date, "10:00", "13:00"),
        ]),
        days: dates.map((date) => timeDay(date, bars("hall", "10:00", "13:00"))),
        // 過去の割合から、「often」の目安は「seldom」の3倍になる。
        history: {
          recruitmentCount: 1,
          staffs: [
            {
              staffId: "often",
              requestedDays: 10,
              assignedDays: 10,
              lastRequestedDays: 10,
              lastAssignedDays: 10,
              positions: [{ positionId: "hall", days: 10 }],
            },
            {
              staffId: "seldom",
              requestedDays: 10,
              assignedDays: 0,
              lastRequestedDays: 10,
              lastAssignedDays: 0,
              positions: [],
            },
          ],
        },
      }),
    );

    // 目安だけで選ぶと、3日目と4日目は続けて「often」になり、「seldom」は2日続けて入れない。
    expect(result.shifts.map((shift) => `${shift.date} ${shift.staffId}`)).toEqual([
      `${DAY1} seldom`,
      `${DAY2} often`,
      "2026-08-19 seldom",
      "2026-08-20 often",
    ]);
  });

  it("同じ足りない時間を2人が伸ばせる場合は、その日の取り分に対して勤務が短い人を伸ばす", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("m", { hall: "newcomer" }), staff("r")],
        requestedSlots: [
          request("a", DAY1, "09:00", "15:00"),
          request("m", DAY1, "09:00", "13:00"),
          request("r", DAY1, "13:00", "18:00"),
        ],
        days: [
          timeDay(DAY1, [
            ...bars("hall", "09:00", "13:00"),
            ...bars("kitchen", "13:00", "15:00"),
            ...bars("hall", "15:00", "18:00"),
          ]),
        ],
      }),
    );

    // キッチンの13時から15時は、aもrも伸ばせる。aは「m」と希望が重なる9時から13時に4時間入っていて、取り分より長い。
    // rはほかに希望者のいない15時からの3時間で、取り分より短い。rを伸ばす。
    expect(summarize(result)).toEqual(["a 09:00-13:00 hall", "r 13:00-15:00 kitchen / 15:00-18:00 hall"]);
    expect(result.hasShortage).toBe(false);
  });

  it("ほかの人の勤務を伸ばして埋められる時間には、3時間に満たない勤務を作らない", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a", { kitchen: "unavailable" }), staff("b")],
        requestedSlots: [request("a", DAY1, "09:00", "12:00"), request("b", DAY1, "10:00", "15:00")],
        days: [timeDay(DAY1, [...bars("hall", "10:00", "12:00"), ...bars("kitchen", "12:00", "15:00")])],
      }),
    );

    // aが入れるのは、ホールの10時から12時の2時間だけである。キッチンに入るbの勤務を前へ伸ばせるため、aの2時間の勤務は作らない。
    expect(summarize(result)).toEqual(["b 10:00-12:00 hall / 12:00-15:00 kitchen"]);
    expect(result.hasShortage).toBe(false);
  });

  it("3時間以上の勤務では埋められない時間は、2時間以上の勤務で埋める", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b")],
        requestedSlots: [request("a", DAY1, "09:00", "12:00"), request("b", DAY1, "12:00", "15:00")],
        days: [timeDay(DAY1, bars("hall", "10:00", "15:00"))],
      }),
    );

    expect(summarize(result)).toEqual(["a 10:00-12:00 hall", "b 12:00-15:00 hall"]);
    expect(result.hasShortage).toBe(false);
  });

  it("早い時間から入れる人と、遅い時間からの人で、期間を通した勤務時間がそろう", () => {
    const dates = [DAY1, DAY2, "2026-08-19", "2026-08-20"];
    const windows: Record<string, [string, string]> = {
      early1: ["09:00", "21:00"],
      early2: ["09:00", "21:00"],
      late1: ["13:00", "21:00"],
      late2: ["13:00", "21:00"],
    };
    const result = buildTimeAssignments(
      timeInput({
        dates,
        staffs: Object.keys(windows).map((id) => staff(id)),
        requestedSlots: dates.flatMap((date) =>
          Object.entries(windows).map(([staffId, [startTime, endTime]]) => request(staffId, date, startTime, endTime)),
        ),
        days: dates.map((date) => timeDay(date, bars("hall", "09:00", "21:00", 2))),
      }),
    );

    const minutesByStaff = Object.fromEntries(
      Object.keys(windows).map((staffId) => [
        staffId,
        result.shifts
          .filter((shift) => shift.staffId === staffId)
          .flatMap((shift) => shift.segments)
          .reduce((total, segment) => total + timeToMinutes(segment.endTime) - timeToMinutes(segment.startTime), 0),
      ]),
    );
    expect(minutesByStaff).toEqual({ early1: 24 * 60, early2: 24 * 60, late1: 24 * 60, late2: 24 * 60 });
  });

  it("見習いでない候補がいる時間は、見習いだけにしない", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("n", { hall: "newcomer" }), staff("s")],
        requestedSlots: [request("n", DAY1, "10:00", "14:00"), request("s", DAY1, "10:00", "14:00")],
        days: [timeDay(DAY1, bars("hall", "10:00", "14:00"))],
        history: {
          recruitmentCount: 1,
          staffs: [
            // 過去の割合だけで選ぶと、見習いが先になる。
            {
              staffId: "n",
              requestedDays: 4,
              assignedDays: 1,
              lastRequestedDays: 4,
              lastAssignedDays: 1,
              positions: [],
            },
            {
              staffId: "s",
              requestedDays: 4,
              assignedDays: 4,
              lastRequestedDays: 4,
              lastAssignedDays: 4,
              positions: [],
            },
          ],
        },
      }),
    );

    expect(summarize(result)).toEqual(["s 10:00-14:00 hall"]);
  });

  it("ほかの希望者で埋まる場合は、1人の勤務を1つのポジションにする", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b")],
        requestedSlots: [request("a", DAY1, "10:00", "17:00"), request("b", DAY1, "14:00", "17:00")],
        days: [timeDay(DAY1, [...bars("hall", "10:00", "14:00"), ...bars("kitchen", "14:00", "17:00")])],
      }),
    );

    expect(summarize(result)).toEqual(["a 10:00-14:00 hall", "b 14:00-17:00 kitchen"]);
    expect(result.hasShortage).toBe(false);
  });

  it("1つのポジションでは不足が残る場合だけ、勤務を別のポジションへ伸ばす", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "10:00", "16:00")],
        days: [timeDay(DAY1, [...bars("hall", "10:00", "14:00"), ...bars("kitchen", "14:00", "16:00")])],
      }),
    );

    expect(summarize(result)).toEqual(["a 10:00-14:00 hall / 14:00-16:00 kitchen"]);
    expect(result.hasShortage).toBe(false);
  });

  it("別のポジションへ伸ばすのは、1時間以上続く場合だけである", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "10:00", "16:00")],
        days: [timeDay(DAY1, [...bars("hall", "10:00", "14:00"), ...bars("kitchen", "14:00", "14:30")])],
      }),
    );

    expect(summarize(result)).toEqual(["a 10:00-14:00 hall"]);
    expect(result.hasShortage).toBe(true);
  });

  it("1つのポジションでは2時間に届かない時間を、隣り合う別のポジションとつないで1つの勤務にする", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "10:00", "18:00")],
        days: [timeDay(DAY1, [...bars("hall", "12:00", "13:00"), ...bars("kitchen", "13:00", "14:00")])],
      }),
    );

    expect(summarize(result)).toEqual(["a 12:00-13:00 hall / 13:00-14:00 kitchen"]);
    expect(result.hasShortage).toBe(false);
  });

  it("必要人数の多いポジションに人が集まる場合も、だれもいないポジションを先に埋める", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b"), staff("c")],
        requestedSlots: ["a", "b", "c"].map((staffId) => request(staffId, DAY1, "10:00", "16:00")),
        // ホールは3人、キッチンは1人が必要で、入れるのは3人である。
        days: [timeDay(DAY1, [...bars("hall", "10:00", "16:00", 3), ...bars("kitchen", "10:00", "16:00")])],
      }),
    );

    expect(
      summarize(result)
        .map((line) => line.slice(2))
        .sort(),
    ).toEqual(["10:00-16:00 hall", "10:00-16:00 hall", "10:00-16:00 kitchen"]);
    expect(result.hasShortage).toBe(true);
  });

  it("だれもいないポジションが残る場合は、2人以上いるポジションから、担当できる人を移す", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a", { kitchen: "unavailable" }), staff("b", { kitchen: "unavailable" }), staff("c")],
        requestedSlots: ["a", "b", "c"].map((staffId) => request(staffId, DAY1, "10:00", "16:00")),
        // ホールは4人が必要なので、人を入れる順ではホールが先に3人になる。
        days: [timeDay(DAY1, [...bars("hall", "10:00", "16:00", 4), ...bars("kitchen", "10:00", "16:00")])],
      }),
    );

    // キッチンを担当できるcだけを、勤務の時間を変えずにキッチンへ移す。
    expect(summarize(result)).toEqual(["a 10:00-16:00 hall", "b 10:00-16:00 hall", "c 10:00-16:00 kitchen"]);
  });

  it("だれもいないポジションへ移すのは、元のポジションに1人以上が残る時間だけである", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b")],
        requestedSlots: [request("a", DAY1, "10:00", "16:00"), request("b", DAY1, "13:00", "16:00")],
        days: [timeDay(DAY1, [...bars("hall", "10:00", "16:00", 3), ...bars("kitchen", "10:00", "16:00")])],
      }),
    );

    // 10:00から13:00はaだけなので、ホールに残す。2人がそろう13:00からは、1人をキッチンへ移す。
    // 勤務の途中でポジションが替わらないよう、13:00から入るbを移す。
    expect(summarize(result)).toEqual(["a 10:00-16:00 hall", "b 13:00-16:00 kitchen"]);
  });

  it("だれもいない時間が1時間に満たないポジションへは、移さない", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b")],
        requestedSlots: ["a", "b"].map((staffId) => request(staffId, DAY1, "10:00", "16:00")),
        days: [timeDay(DAY1, [...bars("hall", "10:00", "16:00", 2), ...bars("kitchen", "12:00", "12:30")])],
      }),
    );

    expect(summarize(result)).toEqual(["a 10:00-16:00 hall", "b 10:00-16:00 hall"]);
    expect(result.hasShortage).toBe(true);
  });

  it("6時間45分以上の勤務に45分の休憩を、勤務の開始と終了から1時間以上離して入れる", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "10:00", "17:00")],
        days: [timeDay(DAY1, bars("hall", "10:00", "17:00"))],
      }),
    );

    expect(summarize(result)).toEqual(["a 10:00-17:00 hall 休憩 13:00-13:45"]);
    // 休憩を埋められる人がいないため、休憩の時間は不足のまま残る。休憩は短くしない。
    expect(result.hasShortage).toBe(true);
  });

  it("6時間30分になる勤務は、休憩を入れずに、早く上がる形で6時間に縮める", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "10:00", "16:30")],
        days: [timeDay(DAY1, bars("hall", "10:00", "16:30"))],
      }),
    );

    expect(summarize(result)).toEqual(["a 10:00-16:00 hall"]);
    // 16:00から16:30は、入れる人がいないため不足のまま残る。
    expect(result.hasShortage).toBe(true);
  });

  it("早く上がるとだれもいない時間ができる場合は、遅く入る形で縮める", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b")],
        requestedSlots: [request("a", DAY1, "10:00", "16:30"), request("b", DAY1, "10:00", "12:00")],
        // 10:00から12:00は2人、12:00から16:30は1人が必要である。
        days: [timeDay(DAY1, [...bars("hall", "10:00", "16:30"), ...bars("hall", "10:00", "12:00")])],
      }),
    );

    // aが早く上がると16:00から16:30にだれもいなくなる。10:00から10:30はbがいるため、aを遅く入れる。
    expect(summarize(result)).toEqual(["a 10:30-16:30 hall", "b 10:00-12:00 hall"]);
  });

  it("縮めて空いた時間は、ほかの人の勤務を希望の範囲で伸ばして埋める", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b")],
        requestedSlots: [request("a", DAY1, "09:00", "15:30"), request("b", DAY1, "15:00", "20:00")],
        days: [timeDay(DAY1, [...bars("hall", "09:00", "15:30"), ...bars("hall", "15:30", "20:00")])],
      }),
    );

    // aは9:00から15:30（6時間30分）を15:00までに縮める。15:30から入るbを15:00からに伸ばして埋める。
    expect(summarize(result)).toEqual(["a 09:00-15:00 hall", "b 15:00-20:00 hall"]);
    expect(result.hasShortage).toBe(false);
  });

  it("勤務を伸ばすときも、6時間を少し超える長さにはしない", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "10:00", "18:00")],
        // ホールの4時間のあとに、キッチンの2時間30分が続く。つなぐと6時間30分になる。
        days: [timeDay(DAY1, [...bars("hall", "10:00", "14:00"), ...bars("kitchen", "14:00", "16:30")])],
      }),
    );

    expect(summarize(result)).toEqual(["a 10:00-14:00 hall / 14:00-16:00 kitchen"]);
  });

  it("9時間以上の勤務には、1時間の休憩を入れる", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "09:00", "18:00")],
        days: [timeDay(DAY1, bars("hall", "09:00", "18:00"))],
      }),
    );

    expect(summarize(result)).toEqual(["a 09:00-18:00 hall 休憩 13:00-14:00"]);
  });

  it("6時間ちょうどの勤務には、休憩を入れない", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "06:00", "12:00")],
        pattern: { kind: "time", startTime: "06:00", endTime: "22:00" },
        days: [timeDay(DAY1, bars("hall", "06:00", "12:00"))],
      }),
    );

    expect(summarize(result)).toEqual(["a 06:00-12:00 hall"]);
    expect(result.hasShortage).toBe(false);
  });

  it("休憩を入れない指定では、休憩を入れず、休憩に合わせて勤務を縮めることも伸ばすこともしない", () => {
    const input = {
      staffs: [staff("a"), staff("b")],
      requestedSlots: [request("a", DAY1, "09:00", "18:00"), request("b", DAY1, "09:00", "15:30")],
      // aは9時間、bは6時間30分の勤務になる。
      days: [timeDay(DAY1, [...bars("hall", "09:00", "18:00"), ...bars("kitchen", "09:00", "15:30")])],
    };
    const skills = {
      staffs: [staff("a", { kitchen: "unavailable" }), staff("b", { hall: "unavailable" })],
    };

    // 休憩を入れる指定では、aに1時間の休憩が入り、bは6時間に縮む。
    expect(summarize(buildTimeAssignments(timeInput({ ...input, ...skills })))).toEqual([
      "a 09:00-18:00 hall 休憩 13:00-14:00",
      "b 09:00-15:00 kitchen",
    ]);
    expect(summarize(buildTimeAssignments(timeInput({ ...input, ...skills, includesBreaks: false })))).toEqual([
      "a 09:00-18:00 hall",
      "b 09:00-15:30 kitchen",
    ]);
  });

  it("同じ勤務の人の休憩は重ねず、中央の前後へ続けて置く", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b")],
        requestedSlots: [request("a", DAY1, "10:00", "18:00"), request("b", DAY1, "10:00", "18:00")],
        days: [timeDay(DAY1, bars("hall", "10:00", "18:00", 2))],
      }),
    );

    const breaks = result.shifts
      .flatMap((shift) => shift.breaks)
      .map((item) => [timeToMinutes(item.startTime), timeToMinutes(item.endTime)])
      .sort((a, b) => a[0] - b[0]);
    expect(breaks).toHaveLength(2);
    expect(breaks[0][1]).toBe(breaks[1][0]);
    expect(breaks.every(([start, end]) => end - start === 45)).toBe(true);
  });

  it("勤務の時間が違う人の休憩は、ほかの人の休憩に寄せず、それぞれの勤務の中央に置く", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b")],
        requestedSlots: [request("a", DAY1, "10:00", "18:00"), request("b", DAY1, "12:00", "20:00")],
        // 10:00から12:00と18:00から20:00は1人、12:00から18:00は2人が必要である。
        days: [timeDay(DAY1, [...bars("hall", "10:00", "18:00"), ...bars("hall", "12:00", "20:00")])],
      }),
    );

    // aの中央は14:00、bの中央は16:00である。
    expect(summarize(result)).toEqual(["a 10:00-18:00 hall 休憩 13:30-14:15", "b 12:00-20:00 hall 休憩 15:30-16:15"]);
  });

  it("勤務の中央がすでに足りない時間と重なる場合は、重ならない時刻のうち中央にいちばん近い時刻へずらす", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b"), staff("c")],
        requestedSlots: ["a", "b", "c"].map((staffId) => request(staffId, DAY1, "10:00", "18:00")),
        days: [timeDay(DAY1, bars("hall", "10:00", "18:00", 3))],
      }),
    );

    // 3人とも中央は14:00である。1人目は中央に置き、2人目と3人目は、その前後へ重ねずに置く。
    const breaks = result.shifts.map((shift) => shift.breaks.map((item) => `${item.startTime}-${item.endTime}`).join());
    expect(breaks.slice().sort()).toEqual(["12:45-13:30", "13:30-14:15", "14:15-15:00"]);
  });

  it("人数がもともと足りない時間帯でも、休憩を重ねずに順番に置く", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b")],
        requestedSlots: [request("a", DAY1, "10:00", "18:00"), request("b", DAY1, "10:00", "18:00")],
        // 3人が必要な時間帯に、2人しか入れない。
        days: [timeDay(DAY1, bars("hall", "10:00", "18:00", 3))],
      }),
    );

    const breaks = result.shifts.map((shift) => shift.breaks.map((item) => `${item.startTime}-${item.endTime}`).join());
    expect(breaks.slice().sort()).toEqual(["13:30-14:15", "14:15-15:00"]);
  });

  it("同じ勤務の人が多くても、休憩が重ならずに置けるうちは、1人ずつ順番に置く", () => {
    const staffIds = ["a", "b", "c", "d", "e", "f"];
    const result = buildTimeAssignments(
      timeInput({
        staffs: staffIds.map((id) => staff(id)),
        requestedSlots: staffIds.map((staffId) => request(staffId, DAY1, "10:00", "18:00")),
        days: [timeDay(DAY1, bars("hall", "10:00", "18:00", 6))],
      }),
    );

    // 休憩を置けるのは11:00から17:00で、45分の休憩が重ならずに6人分入る。
    const breaks = result.shifts
      .flatMap((shift) => shift.breaks)
      .map((item) => [timeToMinutes(item.startTime), timeToMinutes(item.endTime)])
      .sort((a, b) => a[0] - b[0]);
    expect(breaks).toHaveLength(6);
    breaks.slice(1).forEach(([start], index) => {
      expect(start).toBeGreaterThanOrEqual(breaks[index][1]);
    });
  });

  it("ポジションの違う人の休憩も、重ねずに順番に置く", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a", { kitchen: "unavailable" }), staff("b", { hall: "unavailable" })],
        requestedSlots: [request("a", DAY1, "09:00", "19:00"), request("b", DAY1, "09:00", "19:00")],
        days: [timeDay(DAY1, [...bars("hall", "09:00", "19:00"), ...bars("kitchen", "09:00", "19:00")])],
      }),
    );

    // 2人とも勤務の中央は14:00である。1人目を中央に置き、2人目はその隣へずらす。
    expect(summarize(result)).toEqual([
      "a 09:00-19:00 hall 休憩 13:30-14:30",
      "b 09:00-19:00 kitchen 休憩 12:30-13:30",
    ]);
  });

  it("ポジションの違う人が多い場合は、勤務の中央の前後2時間の中でずらし、収まらない分だけを重ねる", () => {
    const positionIds = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
    const result = buildTimeAssignments(
      timeInput({
        positionIds,
        // 1人が1つのポジションだけを担当する。
        staffs: positionIds.map((own) =>
          staff(
            `staff-${own}`,
            Object.fromEntries(positionIds.filter((id) => id !== own).map((id) => [id, "unavailable"])),
          ),
        ),
        requestedSlots: positionIds.map((own) => request(`staff-${own}`, DAY1, "09:00", "19:00")),
        days: [
          timeDay(
            DAY1,
            positionIds.flatMap((positionId) => bars(positionId, "09:00", "19:00")),
          ),
        ],
      }),
    );

    const breaks = result.shifts
      .flatMap((shift) => shift.breaks)
      .map((item) => [timeToMinutes(item.startTime), timeToMinutes(item.endTime)]);
    expect(breaks).toHaveLength(7);
    // 勤務の中央は14:00。休憩の中央が12:00から16:00に入るのは、11:30から16:30の間の休憩である。
    expect(breaks.every(([start, end]) => start >= 11 * 60 + 30 && end <= 16 * 60 + 30)).toBe(true);
    // 重ならずに置けるのは5人までで、残りの2人は1人ずつ重なる。3人が同時に休憩する時間は作らない。
    const maxConcurrent = Math.max(
      ...breaks.map(
        ([start]) => breaks.filter(([otherStart, otherEnd]) => otherStart <= start && start < otherEnd).length,
      ),
    );
    expect(maxConcurrent).toBe(2);
  });

  it("休憩で足りなくなった時間が続く場合は、まだ勤務のない希望者を入れて埋め、15分の余りを許す", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b"), staff("c"), staff("relief")],
        requestedSlots: [
          request("a", DAY1, "10:00", "18:00"),
          request("b", DAY1, "10:00", "18:00"),
          request("c", DAY1, "10:00", "18:00"),
          request("relief", DAY1, "12:00", "16:00"),
        ],
        days: [timeDay(DAY1, bars("hall", "10:00", "18:00", 3))],
      }),
    );

    // 3人の45分の休憩が12:45から15:00まで続く。30分単位の勤務で埋めるため、12:30から入る。
    expect(findShift(result, "relief")).toEqual({
      staffId: "relief",
      date: DAY1,
      segments: [{ startTime: "12:30", endTime: "15:00", positionId: "hall" }],
      breaks: [],
    });
    expect(result.hasShortage).toBe(false);
  });

  it("休憩で足りなくなった時間を、隣り合う勤務を希望の範囲で伸ばして埋める", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b")],
        requestedSlots: [request("a", DAY1, "10:00", "17:00"), request("b", DAY1, "10:00", "15:00")],
        // 10:00から13:00は2人、13:00から17:00は1人が必要である。
        days: [timeDay(DAY1, [...bars("hall", "10:00", "17:00"), ...bars("hall", "10:00", "13:00")])],
      }),
    );

    // aは10:00から17:00（7時間）で、休憩は13:00から13:45に入る。
    // 13:00で終わるbの勤務を14:00まで伸ばして、休憩の時間を埋める。13:45から14:00の15分は余りになる。
    expect(summarize(result)).toEqual(["a 10:00-17:00 hall 休憩 13:00-13:45", "b 10:00-14:00 hall"]);
    expect(result.hasShortage).toBe(false);
  });

  it("伸ばすと休憩が長くなる勤務は、休憩の時間を埋めるためには伸ばさない", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a", { kitchen: "unavailable" }), staff("b")],
        requestedSlots: [request("a", DAY1, "09:00", "19:00"), request("b", DAY1, "13:00", "20:30")],
        days: [timeDay(DAY1, [...bars("hall", "09:00", "19:00"), ...bars("kitchen", "14:30", "20:30")])],
      }),
    );

    // aは9:00から19:00（10時間）で、休憩は13:30から14:30に入る。bはキッチンの14:30から20:30（6時間）で休憩がない。
    // aの休憩を埋めるためにbを13:30まで伸ばすと7時間になり、bに休憩が要るようになるため、伸ばさない。
    // ホールはaだけなので、休憩をどこへ動かしても、だれもいない時間は短くならない。休憩は勤務の中央のままにする。
    expect(summarize(result)).toEqual(["a 09:00-19:00 hall 休憩 13:30-14:30", "b 14:30-20:30 kitchen"]);
    expect(result.hasShortage).toBe(true);
  });

  it("休憩でだれもいなくなる時間が埋まらない場合は、同じポジションにほかの人がいる時刻へ休憩を動かす", () => {
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b")],
        requestedSlots: [request("a", DAY1, "09:00", "19:00"), request("b", DAY1, "13:00", "20:30")],
        days: [timeDay(DAY1, [...bars("hall", "09:00", "19:00"), ...bars("hall", "14:30", "20:30")])],
      }),
    );

    // aの休憩を勤務の中央（13:30から14:30）に置くと、ホールにだれもいなくなる。bは伸ばすと休憩が要るため、伸ばせない。
    // bのいる14:30からへ休憩を動かし、ホールに1人を残す。
    expect(summarize(result)).toEqual(["a 09:00-19:00 hall 休憩 14:30-15:30", "b 14:30-20:30 hall"]);
  });

  it("勤務と休憩は、本人の希望の時間の内側に収まる", () => {
    const requests = [
      request("a", DAY1, "09:00", "18:00"),
      request("b", DAY1, "12:00", "22:00"),
      request("c", DAY1, "10:00", "15:00"),
      request("d", DAY1, "16:00", "22:00"),
    ];
    const result = buildTimeAssignments(
      timeInput({
        staffs: [staff("a"), staff("b"), staff("c", { kitchen: "unavailable" }), staff("d", { hall: "newcomer" })],
        requestedSlots: requests,
        days: [
          timeDay(DAY1, [
            ...bars("hall", "09:00", "22:00"),
            ...bars("hall", "11:00", "14:00"),
            ...bars("kitchen", "11:00", "21:00"),
          ]),
        ],
      }),
    );

    expect(result.shifts.length).toBeGreaterThan(0);
    for (const shift of result.shifts) {
      const requested = requests.find((item) => item.staffId === shift.staffId);
      if (!requested) throw new Error(`no request: ${shift.staffId}`);
      const first = shift.segments[0];
      const last = shift.segments[shift.segments.length - 1];
      expect(timeToMinutes(first.startTime)).toBeGreaterThanOrEqual(timeToMinutes(requested.startTime));
      expect(timeToMinutes(last.endTime)).toBeLessThanOrEqual(timeToMinutes(requested.endTime));
      // 区間は続いていて、休憩は勤務の開始より後、終了より前にある。
      shift.segments.slice(1).forEach((segment, index) => {
        expect(segment.startTime).toBe(shift.segments[index].endTime);
      });
      for (const item of shift.breaks) {
        expect(timeToMinutes(item.startTime)).toBeGreaterThan(timeToMinutes(first.startTime));
        expect(timeToMinutes(item.endTime)).toBeLessThan(timeToMinutes(last.endTime));
      }
    }
    expect(findShift(result, "c")?.segments.every((segment) => segment.positionId === "hall") ?? true).toBe(true);
  });

  it("必要人数のない日は作らずに飛ばす", () => {
    const result = buildTimeAssignments(
      timeInput({
        dates: [DAY1, DAY2],
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "10:00", "14:00"), request("a", DAY2, "10:00", "14:00")],
        days: [timeDay(DAY1, []), { date: DAY2, requirements: null }],
      }),
    );

    expect(result).toEqual({ shifts: [], hasShortage: false, skippedDates: [DAY1, DAY2] });
  });

  it("スタッフと希望の並びを変えても、同じ結果になる", () => {
    const staffs = [staff("a"), staff("b"), staff("c", { kitchen: "newcomer" }), staff("d", { hall: "unavailable" })];
    const requestedSlots = [DAY1, DAY2].flatMap((date) => [
      request("a", date, "09:00", "18:00"),
      request("b", date, "12:00", "22:00"),
      request("c", date, "10:00", "20:00"),
      request("d", date, "09:00", "22:00"),
    ]);
    const days = [DAY1, DAY2].map((date) =>
      timeDay(date, [...bars("hall", "10:00", "21:00", 2), ...bars("kitchen", "11:00", "20:00")]),
    );

    const forward = buildTimeAssignments(timeInput({ dates: [DAY1, DAY2], staffs, requestedSlots, days }));
    const reversed = buildTimeAssignments(
      timeInput({
        dates: [DAY2, DAY1],
        staffs: staffs.slice().reverse(),
        requestedSlots: requestedSlots.slice().reverse(),
        days: days.slice().reverse(),
      }),
    );

    expect(reversed).toEqual(forward);
    expect(forward.shifts.length).toBeGreaterThan(0);
  });
});
