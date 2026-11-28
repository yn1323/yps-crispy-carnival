import { describe, expect, it } from "vitest";
import type { AutoCreateStaffHistory } from "./history";
import { buildSlotAssignments } from "./slotAssignments";
import type { AutoCreateInput, AutoCreateSkillLevel, AutoCreateStaff } from "./types";

const DAY1 = "2026-08-17";
const DAY2 = "2026-08-18";
const DAY3 = "2026-08-19";
const DAY4 = "2026-08-20";
const DAY5 = "2026-08-21";
const DAY6 = "2026-08-22";

const staff = (id: string, skills: Record<string, AutoCreateSkillLevel> = {}): AutoCreateStaff => ({
  id,
  positionSkills: Object.entries(skills).map(([positionId, level]) => ({ positionId, level })),
});

const history = (staffId: string, overrides: Partial<AutoCreateStaffHistory> = {}): AutoCreateStaffHistory => ({
  staffId,
  requestedDays: 0,
  assignedDays: 0,
  lastRequestedDays: 0,
  lastAssignedDays: 0,
  positions: [],
  ...overrides,
});

const dateOnlyInput = (overrides: Partial<AutoCreateInput> = {}): AutoCreateInput => ({
  pattern: { kind: "dateOnly" },
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

const dateOnlyDay = (date: string, counts: Record<string, number>) => ({
  date,
  requirements: {
    kind: "dateOnly" as const,
    counts: Object.entries(counts).map(([positionId, count]) => ({ positionId, count })),
  },
});

const requestDates = (staffId: string, dates: string[]) => dates.map((date) => ({ staffId, date }));

/** 作った勤務を「日 スタッフ ポジション」の文字列にして、並べて比べる。 */
const summarize = (result: ReturnType<typeof buildSlotAssignments>) =>
  result.shifts.map(
    (shift) =>
      `${shift.date} ${shift.staffId} ${shift.segments
        .map((segment) => (segment.optionId ? `${segment.optionId}:${segment.positionId}` : segment.positionId))
        .join("+")}`,
  );

const countDays = (result: ReturnType<typeof buildSlotAssignments>, staffId: string) =>
  result.shifts.filter((shift) => shift.staffId === staffId).length;

describe("buildSlotAssignments（日付選択）", () => {
  it("希望者が必要人数より多い日は、必要人数ちょうどで止める", () => {
    const result = buildSlotAssignments(
      dateOnlyInput({
        staffs: [staff("a"), staff("b"), staff("c")],
        requestedDates: [...requestDates("a", [DAY1]), ...requestDates("b", [DAY1]), ...requestDates("c", [DAY1])],
        days: [dateOnlyDay(DAY1, { hall: 2 })],
      }),
    );

    expect(result.shifts).toHaveLength(2);
    expect(result.shifts.every((shift) => shift.segments.length === 1 && shift.segments[0].positionId === "hall")).toBe(
      true,
    );
    expect(result.hasShortage).toBe(false);
    expect(result.skippedDates).toEqual([]);
  });

  it("勤務の時刻は受付時間の端から端までにし、休憩は入れない", () => {
    const result = buildSlotAssignments(
      dateOnlyInput({
        staffs: [staff("a")],
        requestedDates: requestDates("a", [DAY1]),
        days: [dateOnlyDay(DAY1, { hall: 1 })],
      }),
    );

    expect(result.shifts).toEqual([
      {
        staffId: "a",
        date: DAY1,
        segments: [{ startTime: "09:00", endTime: "22:00", positionId: "hall" }],
        breaks: [],
      },
    ]);
  });

  it("希望のない日、対象でないスタッフ、担当外のポジションには入れず、不足を残す", () => {
    const result = buildSlotAssignments(
      dateOnlyInput({
        dates: [DAY1, DAY2],
        // 「x」は希望を出しているが、提出済みのシフト対象スタッフではない。
        staffs: [staff("a"), staff("b", { hall: "unavailable" })],
        requestedDates: [
          ...requestDates("a", [DAY1]),
          ...requestDates("b", [DAY1, DAY2]),
          ...requestDates("x", [DAY2]),
        ],
        days: [dateOnlyDay(DAY1, { hall: 2 }), dateOnlyDay(DAY2, { hall: 1 })],
      }),
    );

    expect(summarize(result)).toEqual([`${DAY1} a hall`]);
    expect(result.hasShortage).toBe(true);
  });

  it("必要人数のない日、集め方の合わない必要人数の日、人数が0の日は作らずに飛ばす", () => {
    const result = buildSlotAssignments(
      dateOnlyInput({
        dates: [DAY1, DAY2, DAY3, DAY4],
        staffs: [staff("a")],
        requestedDates: requestDates("a", [DAY1, DAY2, DAY3, DAY4]),
        days: [
          dateOnlyDay(DAY1, { hall: 1 }),
          { date: DAY2, requirements: null },
          {
            date: DAY3,
            requirements: { kind: "time", bars: [{ positionId: "hall", startTime: "09:00", endTime: "12:00" }] },
          },
          dateOnlyDay(DAY4, { hall: 0 }),
        ],
      }),
    );

    expect(summarize(result)).toEqual([`${DAY1} a hall`]);
    expect(result.skippedDates).toEqual([DAY2, DAY3, DAY4]);
    expect(result.hasShortage).toBe(false);
  });

  it("定休日（対象の日にない日）と、いまの設定にないポジションには入れない", () => {
    const result = buildSlotAssignments(
      dateOnlyInput({
        dates: [DAY1],
        staffs: [staff("a")],
        requestedDates: requestDates("a", [DAY1, DAY2]),
        days: [dateOnlyDay(DAY1, { deleted: 1 }), dateOnlyDay(DAY2, { hall: 1 })],
      }),
    );

    expect(result.shifts).toEqual([]);
    expect(result.skippedDates).toEqual([DAY1]);
  });

  it("過去がない場合は、希望した日数が同じ人の入った日数がそろう", () => {
    const result = buildSlotAssignments(
      dateOnlyInput({
        dates: [DAY1, DAY2, DAY3, DAY4],
        staffs: [staff("a"), staff("b")],
        requestedDates: [
          ...requestDates("a", [DAY1, DAY2, DAY3, DAY4]),
          ...requestDates("b", [DAY1, DAY2, DAY3, DAY4]),
        ],
        days: [DAY1, DAY2, DAY3, DAY4].map((date) => dateOnlyDay(date, { hall: 1 })),
      }),
    );

    expect(result.shifts).toHaveLength(4);
    expect(countDays(result, "a")).toBe(2);
    expect(countDays(result, "b")).toBe(2);
  });

  it("希望した日数が違う人は、希望のうち入った割合が近づく", () => {
    const allDays = [DAY1, DAY2, DAY3, DAY4, DAY5, DAY6];
    const result = buildSlotAssignments(
      dateOnlyInput({
        dates: allDays,
        staffs: [staff("a"), staff("b")],
        // aは6日、bは3日を希望している。必要人数は毎日1人。
        requestedDates: [...requestDates("a", allDays), ...requestDates("b", [DAY1, DAY2, DAY3])],
        days: allDays.map((date) => dateOnlyDay(date, { hall: 1 })),
      }),
    );

    // bだけが希望していない3日はaが入るため、aは3日以上になる。残りの3日でbが先に入る。
    expect(result.shifts).toHaveLength(6);
    expect(countDays(result, "b")).toBeGreaterThanOrEqual(2);
    expect(countDays(result, "a")).toBe(6 - countDays(result, "b"));
  });

  it("過去の割合が高い人ほど目安の日数が多くなり、同じ希望でも多く入る", () => {
    const allDays = [DAY1, DAY2, DAY3, DAY4, DAY5, DAY6];
    const result = buildSlotAssignments(
      dateOnlyInput({
        dates: allDays,
        staffs: [staff("a"), staff("b")],
        requestedDates: [...requestDates("a", allDays), ...requestDates("b", allDays)],
        days: allDays.map((date) => dateOnlyDay(date, { hall: 1 })),
        history: {
          recruitmentCount: 2,
          staffs: [
            history("a", { requestedDays: 10, assignedDays: 10, lastRequestedDays: 5, lastAssignedDays: 5 }),
            history("b", { requestedDays: 10, assignedDays: 2, lastRequestedDays: 5, lastAssignedDays: 1 }),
          ],
        },
      }),
    );

    // 目安の割合はaが(1.0+0.6)/2=0.8、bが(0.2+0.6)/2=0.4で、目安の日数はaが4.8日、bが2.4日になる。
    expect(countDays(result, "a")).toBe(4);
    expect(countDays(result, "b")).toBe(2);
  });

  it("目安に対する割合が同じなら、直近の1回で希望が通らなかった日数の多い人を先に入れる", () => {
    const result = buildSlotAssignments(
      dateOnlyInput({
        staffs: [staff("a"), staff("b")],
        requestedDates: [...requestDates("a", [DAY1]), ...requestDates("b", [DAY1])],
        days: [dateOnlyDay(DAY1, { hall: 1 })],
        history: {
          recruitmentCount: 1,
          staffs: [
            history("a", { requestedDays: 4, assignedDays: 2, lastRequestedDays: 4, lastAssignedDays: 2 }),
            // 過去の割合はaと同じ0.5だが、直近の1回では4日通っていない。
            history("b", { requestedDays: 8, assignedDays: 4, lastRequestedDays: 8, lastAssignedDays: 4 }),
          ],
        },
      }),
    );

    expect(summarize(result)).toEqual([`${DAY1} b hall`]);
  });

  it("見習いでない候補がいる枠は見習いだけにせず、2人目からは見習いも入れる", () => {
    const result = buildSlotAssignments(
      dateOnlyInput({
        staffs: [staff("n1", { hall: "newcomer" }), staff("n2", { hall: "newcomer" }), staff("s")],
        requestedDates: [...requestDates("n1", [DAY1]), ...requestDates("n2", [DAY1]), ...requestDates("s", [DAY1])],
        days: [dateOnlyDay(DAY1, { hall: 2 })],
        // 過去の割合だけで選ぶと、見習いの2人が先になる。
        history: {
          recruitmentCount: 1,
          staffs: [
            history("n1", { requestedDays: 4, assignedDays: 1, lastRequestedDays: 4, lastAssignedDays: 1 }),
            history("n2", { requestedDays: 4, assignedDays: 1, lastRequestedDays: 4, lastAssignedDays: 1 }),
            history("s", { requestedDays: 4, assignedDays: 4, lastRequestedDays: 4, lastAssignedDays: 4 }),
          ],
        },
      }),
    );

    const members = result.shifts.map((shift) => shift.staffId).sort();
    expect(members).toHaveLength(2);
    expect(members).toContain("s");
    expect(members.filter((staffId) => staffId !== "s")).toHaveLength(1);
  });

  it("見習いしか候補がいない枠には、見習いを入れる", () => {
    const result = buildSlotAssignments(
      dateOnlyInput({
        staffs: [staff("n", { hall: "newcomer" })],
        requestedDates: requestDates("n", [DAY1]),
        days: [dateOnlyDay(DAY1, { hall: 1 })],
      }),
    );

    expect(summarize(result)).toEqual([`${DAY1} n hall`]);
  });

  it("候補の少ないポジションを先に埋め、両方を担当できる人を少ないほうへ入れる", () => {
    const result = buildSlotAssignments(
      dateOnlyInput({
        staffs: [staff("both"), staff("hallOnly", { kitchen: "unavailable" })],
        requestedDates: [...requestDates("both", [DAY1]), ...requestDates("hallOnly", [DAY1])],
        days: [dateOnlyDay(DAY1, { hall: 1, kitchen: 1 })],
      }),
    );

    expect(summarize(result)).toEqual([`${DAY1} both kitchen`, `${DAY1} hallOnly hall`]);
    expect(result.hasShortage).toBe(false);
  });

  it("必要人数の多いポジションに人が集まる場合も、先にどのポジションにも1人ずつ入れる", () => {
    const result = buildSlotAssignments(
      dateOnlyInput({
        staffs: [staff("a"), staff("b"), staff("c")],
        requestedDates: ["a", "b", "c"].flatMap((staffId) => requestDates(staffId, [DAY1])),
        // ホールは3人、キッチンは1人が必要で、入れるのは3人である。
        days: [dateOnlyDay(DAY1, { hall: 3, kitchen: 1 })],
      }),
    );

    const positions = result.shifts.map((shift) => shift.segments[0].positionId).sort();
    expect(positions).toEqual(["hall", "hall", "kitchen"]);
    expect(result.hasShortage).toBe(true);
  });

  it("だれもいないポジションが残る場合は、2人以上いるポジションから、担当できる人を移す", () => {
    const result = buildSlotAssignments(
      dateOnlyInput({
        // キッチンに入れるのは「x」だけである。期間の開始日を変えて、ホールの1人目にだれが選ばれても同じ結果になることを確かめる。
        staffs: [staff("x"), staff("y", { kitchen: "unavailable" })],
        requestedDates: [...requestDates("x", [DAY1]), ...requestDates("y", [DAY1])],
        days: [dateOnlyDay(DAY1, { hall: 2, kitchen: 1 })],
      }),
    );
    const other = buildSlotAssignments(
      dateOnlyInput({
        periodStart: DAY2,
        staffs: [staff("x"), staff("y", { kitchen: "unavailable" })],
        requestedDates: [...requestDates("x", [DAY1]), ...requestDates("y", [DAY1])],
        days: [dateOnlyDay(DAY1, { hall: 2, kitchen: 1 })],
      }),
    );

    expect(summarize(result)).toEqual([`${DAY1} x kitchen`, `${DAY1} y hall`]);
    expect(summarize(other)).toEqual([`${DAY1} x kitchen`, `${DAY1} y hall`]);
  });

  it("1人しかいないポジションからは、だれもいないポジションへ移さない", () => {
    const result = buildSlotAssignments(
      dateOnlyInput({
        staffs: [staff("a")],
        requestedDates: requestDates("a", [DAY1]),
        days: [dateOnlyDay(DAY1, { hall: 1, kitchen: 1 })],
      }),
    );

    expect(summarize(result)).toEqual([`${DAY1} a hall`]);
    expect(result.hasShortage).toBe(true);
  });

  it("不足の残った枠へ、別の枠にいる人を移し、空いた枠を別の候補で埋める", () => {
    const result = buildSlotAssignments(
      dateOnlyInput({
        // ホールは3人から2人、キッチンはa、bの2人から1人を選ぶ。候補の割合はホールのほうが小さいため、ホールを先に埋める。
        staffs: [staff("a"), staff("b"), staff("c", { kitchen: "unavailable" })],
        requestedDates: [...requestDates("a", [DAY1]), ...requestDates("b", [DAY1]), ...requestDates("c", [DAY1])],
        days: [dateOnlyDay(DAY1, { hall: 2, kitchen: 1 })],
        // aとbは直近の1回で希望が通っていないため、ホールへ先に入る。そのままではキッチンに入れる人がいなくなる。
        history: {
          recruitmentCount: 1,
          staffs: [
            history("a", { requestedDays: 4, assignedDays: 2, lastRequestedDays: 4, lastAssignedDays: 2 }),
            history("b", { requestedDays: 4, assignedDays: 2, lastRequestedDays: 4, lastAssignedDays: 2 }),
            history("c", { requestedDays: 2, assignedDays: 1, lastRequestedDays: 2, lastAssignedDays: 1 }),
          ],
        },
      }),
    );

    expect(result.hasShortage).toBe(false);
    expect(result.shifts).toHaveLength(3);
    expect(result.shifts.find((shift) => shift.staffId === "c")?.segments[0].positionId).toBe("hall");
    expect(result.shifts.filter((shift) => shift.segments[0].positionId === "kitchen")).toHaveLength(1);
  });

  it("スタッフと希望の並びを変えても、同じ結果になる", () => {
    const allDays = [DAY1, DAY2, DAY3, DAY4];
    const staffs = [staff("a"), staff("b"), staff("c", { kitchen: "newcomer" }), staff("d", { hall: "unavailable" })];
    const requestedDates = staffs.flatMap((member) => requestDates(member.id, allDays));
    const days = allDays.map((date) => dateOnlyDay(date, { hall: 1, kitchen: 1 }));

    const forward = buildSlotAssignments(dateOnlyInput({ dates: allDays, staffs, requestedDates, days }));
    const reversed = buildSlotAssignments(
      dateOnlyInput({
        dates: allDays.slice().reverse(),
        staffs: staffs.slice().reverse(),
        requestedDates: requestedDates.slice().reverse(),
        days: days.slice().reverse(),
      }),
    );

    expect(reversed).toEqual(forward);
    expect(forward.shifts).toHaveLength(8);
  });
});

describe("buildSlotAssignments（パターン選択）", () => {
  const options = [
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "middle", name: "中番", startTime: "12:00", endTime: "18:00", sortOrder: 1 },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 2 },
  ];
  const shiftTypeInput = (overrides: Partial<AutoCreateInput> = {}): AutoCreateInput => ({
    pattern: { kind: "shiftType", options },
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
  const request = (staffId: string, date: string, optionId: string) => {
    const option = options.find((item) => item.id === optionId);
    if (!option) throw new Error(`unknown option: ${optionId}`);
    return { staffId, date, startTime: option.startTime, endTime: option.endTime, optionId };
  };
  const shiftTypeDay = (date: string, counts: Record<string, Record<string, number>>) => ({
    date,
    requirements: {
      kind: "shiftType" as const,
      options: Object.entries(counts).map(([optionId, byPosition]) => ({
        optionId,
        counts: Object.entries(byPosition).map(([positionId, count]) => ({ positionId, count })),
      })),
    },
  });

  it("希望した勤務パターンだけに入れ、勤務の時刻は勤務パターンの時刻にする", () => {
    const result = buildSlotAssignments(
      shiftTypeInput({
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "early")],
        days: [shiftTypeDay(DAY1, { early: { hall: 1 }, late: { hall: 1 } })],
      }),
    );

    expect(result.shifts).toEqual([
      {
        staffId: "a",
        date: DAY1,
        segments: [{ startTime: "09:00", endTime: "15:00", positionId: "hall", optionId: "early" }],
        breaks: [],
      },
    ]);
    expect(result.hasShortage).toBe(true);
  });

  it("勤務パターンのIDを持たない希望は、開始と終了が同じ勤務パターンの希望として読む", () => {
    const result = buildSlotAssignments(
      shiftTypeInput({
        staffs: [staff("a")],
        requestedSlots: [{ staffId: "a", date: DAY1, startTime: "15:00", endTime: "22:00" }],
        days: [shiftTypeDay(DAY1, { late: { hall: 1 } })],
      }),
    );

    expect(summarize(result)).toEqual([`${DAY1} a late:hall`]);
  });

  it("ほかの希望者で埋まる場合は、1人を1日に1つの勤務パターンだけへ入れる", () => {
    const result = buildSlotAssignments(
      shiftTypeInput({
        staffs: [staff("a"), staff("b")],
        requestedSlots: [request("a", DAY1, "early"), request("a", DAY1, "late"), request("b", DAY1, "early")],
        days: [shiftTypeDay(DAY1, { early: { hall: 1 }, late: { hall: 1 } })],
      }),
    );

    expect(summarize(result)).toEqual([`${DAY1} a late:hall`, `${DAY1} b early:hall`]);
    expect(result.hasShortage).toBe(false);
  });

  it("ほかの希望者で埋まらない場合は、時間の重ならない2つ目の勤務パターンへ入れる", () => {
    const result = buildSlotAssignments(
      shiftTypeInput({
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "early"), request("a", DAY1, "late")],
        days: [shiftTypeDay(DAY1, { early: { hall: 1 }, late: { kitchen: 1 } })],
      }),
    );

    expect(summarize(result)).toEqual([`${DAY1} a early:hall+late:kitchen`]);
    expect(result.hasShortage).toBe(false);
  });

  it("時間の重なる勤務パターンには、同じ日に入れない", () => {
    const result = buildSlotAssignments(
      shiftTypeInput({
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "early"), request("a", DAY1, "middle")],
        days: [shiftTypeDay(DAY1, { early: { hall: 1 }, middle: { hall: 1 } })],
      }),
    );

    expect(result.shifts).toHaveLength(1);
    expect(result.shifts[0].segments).toHaveLength(1);
    expect(result.hasShortage).toBe(true);
  });

  it("いまの募集にない勤務パターンの必要人数は使わない", () => {
    const result = buildSlotAssignments(
      shiftTypeInput({
        staffs: [staff("a")],
        requestedSlots: [request("a", DAY1, "early")],
        days: [shiftTypeDay(DAY1, { removed: { hall: 1 } })],
      }),
    );

    expect(result.shifts).toEqual([]);
    expect(result.skippedDates).toEqual([DAY1]);
  });
});
