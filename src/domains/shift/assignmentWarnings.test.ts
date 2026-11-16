import { describe, expect, it } from "vitest";
import { type AssignmentWarning, type AssignmentWarningPattern, computeAssignmentWarnings } from "./assignmentWarnings";
import { BREAK_POSITION } from "./constants";
import type { PositionSegment, ShiftData } from "./types";

const staffs = [
  { id: "staff1", isSubmitted: true },
  { id: "staff2", isSubmitted: false },
];

const seg = (overrides: Partial<PositionSegment>): PositionSegment => ({
  id: "seg-1",
  positionId: "pos1",
  positionName: "ホール",
  color: "#3b82f6",
  start: "10:00",
  end: "18:00",
  ...overrides,
});

const shift = (overrides: Partial<ShiftData>): ShiftData => ({
  id: "shift-1",
  staffId: "staff1",
  staffName: "鈴木太郎",
  date: "2026-01-20",
  requestedTime: null,
  positions: [],
  ...overrides,
});

const timePattern: AssignmentWarningPattern = { kind: "time" };

const run = (shifts: ShiftData[], pattern: AssignmentWarningPattern): AssignmentWarning[] =>
  computeAssignmentWarnings({ shifts, staffs, pattern });

describe("computeAssignmentWarnings", () => {
  it("勤務が割り当てられていないセルは対象外", () => {
    expect(run([shift({ requestedTime: { start: "10:00", end: "18:00" }, positions: [] })], timePattern)).toEqual([]);
  });

  it("休憩のみのセルは対象外", () => {
    expect(run([shift({ positions: [seg({ positionId: BREAK_POSITION.id })] })], timePattern)).toEqual([]);
  });

  it("保存前の希望プレビュー（positions＝希望と一致）では警告しない", () => {
    // 保存済み割当がないセルでは希望がpositionsにプレビュー表示されるが、希望と一致するため食い違いは出ない
    const warnings = run(
      [
        shift({
          requestedTimes: [{ start: "10:00", end: "18:00" }],
          positions: [seg({ start: "10:00", end: "18:00" })],
        }),
      ],
      timePattern,
    );
    expect(warnings).toEqual([]);
  });

  describe("NOT_SUBMITTED", () => {
    it("未提出スタッフに勤務が入っていると警告", () => {
      const warnings = run([shift({ staffId: "staff2", positions: [seg({})] })], timePattern);
      expect(warnings).toMatchObject([{ code: "NOT_SUBMITTED", date: "2026-01-20", staffId: "staff2" }]);
    });

    it("未提出は希望時間外より優先（1セル1件）", () => {
      // 未提出スタッフは希望データを持たないので、NOT_SUBMITTEDのみ
      const warnings = run(
        [shift({ staffId: "staff2", positions: [seg({ start: "06:00", end: "23:00" })] })],
        timePattern,
      );
      expect(warnings.map((w) => w.code)).toEqual(["NOT_SUBMITTED"]);
    });
  });

  describe("OFF_REQUEST", () => {
    it("提出済みで希望のない日に勤務が入っていると警告", () => {
      const warnings = run([shift({ requestedTime: null, requestedTimes: [], positions: [seg({})] })], timePattern);
      expect(warnings.map((w) => w.code)).toEqual(["OFF_REQUEST"]);
    });
  });

  describe("OUTSIDE_REQUESTED_TIME（時間指定の募集）", () => {
    it("希望枠内（短い割当）は警告しない", () => {
      const warnings = run(
        [
          shift({
            requestedTimes: [{ start: "10:00", end: "18:00" }],
            positions: [seg({ start: "10:00", end: "15:00" })],
          }),
        ],
        timePattern,
      );
      expect(warnings).toEqual([]);
    });

    it("希望枠ぴったりは警告しない", () => {
      const warnings = run(
        [
          shift({
            requestedTimes: [{ start: "10:00", end: "18:00" }],
            positions: [seg({ start: "10:00", end: "18:00" })],
          }),
        ],
        timePattern,
      );
      expect(warnings).toEqual([]);
    });

    it("終了が希望より後にはみ出すと警告", () => {
      const warnings = run(
        [
          shift({
            requestedTimes: [{ start: "10:00", end: "18:00" }],
            positions: [seg({ start: "10:00", end: "20:00" })],
          }),
        ],
        timePattern,
      );
      expect(warnings).toMatchObject([
        {
          code: "OUTSIDE_REQUESTED_TIME",
          date: "2026-01-20",
          staffId: "staff1",
        },
      ]);
    });

    it("開始が希望より前にはみ出すと警告", () => {
      const warnings = run(
        [
          shift({
            requestedTimes: [{ start: "10:00", end: "18:00" }],
            positions: [seg({ start: "08:00", end: "15:00" })],
          }),
        ],
        timePattern,
      );
      expect(warnings.map((w) => w.code)).toEqual(["OUTSIDE_REQUESTED_TIME"]);
    });

    it("複数の希望枠は最早開始〜最遅終了の枠で判定する", () => {
      const warnings = run(
        [
          shift({
            requestedTimes: [
              { start: "10:00", end: "12:00" },
              { start: "15:00", end: "18:00" },
            ],
            positions: [seg({ start: "13:00", end: "14:00" })],
          }),
        ],
        timePattern,
      );
      // 10:00-18:00 の枠内なので警告しない（枠の隙間は許容する v1 仕様）
      expect(warnings).toEqual([]);
    });
  });

  describe("パターン選択の募集", () => {
    const pattern: AssignmentWarningPattern = {
      kind: "shiftType",
      options: [
        { id: "morning", name: "早番" },
        { id: "late", name: "遅番" },
      ],
    };

    it("希望時間外の勤務パターン割当を警告（パターン名つき）", () => {
      const warnings = run(
        [
          shift({
            requestedShiftTypeOptionIds: ["morning"],
            positions: [seg({ start: "17:00", end: "21:00", shiftTypeOptionId: "late" })],
          }),
        ],
        pattern,
      );
      expect(warnings).toMatchObject([
        {
          code: "OUTSIDE_REQUESTED_TIME",
          date: "2026-01-20",
          staffId: "staff1",
        },
      ]);
    });

    it("希望どおりの勤務パターンは警告しない", () => {
      const warnings = run(
        [
          shift({
            requestedShiftTypeOptionIds: ["morning"],
            positions: [seg({ start: "09:00", end: "13:00", shiftTypeOptionId: "morning" })],
          }),
        ],
        pattern,
      );
      expect(warnings).toEqual([]);
    });

    it("勤務パターンの希望がない日に割当があるとOFF_REQUEST", () => {
      const warnings = run(
        [shift({ requestedShiftTypeOptionIds: [], positions: [seg({ shiftTypeOptionId: "morning" })] })],
        pattern,
      );
      expect(warnings.map((w) => w.code)).toEqual(["OFF_REQUEST"]);
    });

    it("希望パターンと未希望パターンが混在する場合は未希望のみ連結して警告する", () => {
      const warnings = run(
        [
          shift({
            requestedShiftTypeOptionIds: ["morning"],
            positions: [
              seg({ id: "s1", start: "09:00", end: "13:00", shiftTypeOptionId: "morning" }),
              seg({ id: "s2", start: "17:00", end: "21:00", shiftTypeOptionId: "late" }),
            ],
          }),
        ],
        pattern,
      );
      expect(warnings).toMatchObject([
        {
          code: "OUTSIDE_REQUESTED_TIME",
          date: "2026-01-20",
          staffId: "staff1",
        },
      ]);
    });
  });

  describe("日付選択の募集", () => {
    const pattern: AssignmentWarningPattern = { kind: "dateOnly" };

    it("希望のない日に勤務が入っているとOFF_REQUEST", () => {
      const warnings = run([shift({ requestedTimes: [], positions: [seg({})] })], pattern);
      expect(warnings.map((w) => w.code)).toEqual(["OFF_REQUEST"]);
    });

    it("希望のある日は時間枠の判定をしない（警告なし）", () => {
      const warnings = run(
        [
          shift({
            requestedTimes: [{ start: "09:00", end: "22:00" }],
            positions: [seg({ start: "10:00", end: "23:00" })],
          }),
        ],
        pattern,
      );
      expect(warnings).toEqual([]);
    });
  });

  it("複数セルの警告を全件収集する", () => {
    const warnings = run(
      [
        shift({ staffId: "staff2", date: "2026-01-20", positions: [seg({})] }),
        shift({ staffId: "staff1", date: "2026-01-21", requestedTimes: [], positions: [seg({})] }),
        shift({
          staffId: "staff1",
          date: "2026-01-22",
          requestedTimes: [{ start: "10:00", end: "18:00" }],
          positions: [seg({ start: "10:00", end: "21:00" })],
        }),
      ],
      timePattern,
    );
    expect(warnings.map((w) => `${w.date}:${w.code}`)).toEqual([
      "2026-01-20:NOT_SUBMITTED",
      "2026-01-21:OFF_REQUEST",
      "2026-01-22:OUTSIDE_REQUESTED_TIME",
    ]);
  });
});

describe("computeAssignmentWarnings: 入れないポジション（POSITION_UNAVAILABLE）", () => {
  const positions = [
    { id: "pos1", name: "ホール" },
    { id: "pos2", name: "キッチン" },
    { id: "pos3", name: "レジ" },
  ];
  // staff1は提出済みでキッチンとレジに入れない。staff2は未提出でキッチンに入れない。
  // staff3は提出済みで全ポジションに入れる（キッチンでは新人、レジでは責任者）。入れる場合の熟練度は、この確認事項に関係しない。
  const unavailable = (positionId: string) => ({ positionId, level: "unavailable" as const });
  const profiledStaffs = [
    { id: "staff1", isSubmitted: true, positionSkills: [unavailable("pos2"), unavailable("pos3")] },
    { id: "staff2", isSubmitted: false, positionSkills: [unavailable("pos2")] },
    {
      id: "staff3",
      isSubmitted: true,
      positionSkills: [
        { positionId: "pos2", level: "newcomer" as const },
        { positionId: "pos3", level: "lead" as const },
      ],
    },
  ];
  const kitchen = (overrides: Partial<PositionSegment> = {}) =>
    seg({ id: "seg-kitchen", positionId: "pos2", positionName: "キッチン", ...overrides });
  const requested = { requestedTimes: [{ start: "10:00", end: "18:00" }] };

  const runWithProfiles = (shifts: ShiftData[], pattern: AssignmentWarningPattern = timePattern) =>
    computeAssignmentWarnings({ shifts, staffs: profiledStaffs, pattern, positions });

  it("入れないポジションへ割り当てると、ポジション名の入った確認事項を出す", () => {
    expect(runWithProfiles([shift({ ...requested, positions: [kitchen()] })])).toEqual([
      {
        code: "POSITION_UNAVAILABLE",
        date: "2026-01-20",
        staffId: "staff1",
        message: "入れないポジションの勤務があります（キッチン）",
      },
    ]);
  });

  it("入れるポジションへの割当では出さない", () => {
    expect(runWithProfiles([shift({ ...requested, positions: [seg({})] })])).toEqual([]);
  });

  it("新人や責任者として入れるポジションへの割当では出さない", () => {
    const register = seg({
      id: "seg-register",
      positionId: "pos3",
      positionName: "レジ",
      start: "14:00",
      end: "18:00",
    });

    expect(
      runWithProfiles([
        shift({ staffId: "staff3", ...requested, positions: [kitchen({ start: "10:00", end: "14:00" }), register] }),
      ]),
    ).toEqual([]);
  });

  it("ポジションの値を1つも持たないスタッフには出さない", () => {
    expect(
      computeAssignmentWarnings({
        shifts: [shift({ staffId: "staff4", ...requested, positions: [kitchen()] })],
        staffs: [...profiledStaffs, { id: "staff4", isSubmitted: true }],
        pattern: timePattern,
        positions,
      }),
    ).toEqual([]);
  });

  it("ほかのスタッフが入れないポジションは、そのスタッフにだけ当てる", () => {
    const warnings = runWithProfiles([
      shift({ id: "shift-1", staffId: "staff1", ...requested, positions: [kitchen()] }),
      shift({ id: "shift-3", staffId: "staff3", ...requested, positions: [kitchen()] }),
    ]);

    expect(warnings.map((warning) => [warning.staffId, warning.code])).toEqual([["staff1", "POSITION_UNAVAILABLE"]]);
  });

  it("同じ日に入れないポジションが複数あれば、重複を除いた名前を1件の確認事項にまとめる", () => {
    const warnings = runWithProfiles([
      shift({
        ...requested,
        positions: [
          kitchen({ id: "s1", start: "10:00", end: "12:00" }),
          seg({ id: "s2", start: "12:00", end: "14:00" }),
          seg({ id: "s3", positionId: "pos3", positionName: "レジ", start: "14:00", end: "16:00" }),
          kitchen({ id: "s4", start: "16:00", end: "18:00" }),
        ],
      }),
    ]);

    expect(warnings).toEqual([
      {
        code: "POSITION_UNAVAILABLE",
        date: "2026-01-20",
        staffId: "staff1",
        message: "入れないポジションの勤務があります（キッチン・レジ）",
      },
    ]);
  });

  it("未提出の確認事項より先に出し、1セル1件を保つ", () => {
    const warnings = runWithProfiles([shift({ staffId: "staff2", positions: [kitchen()] })]);

    expect(warnings.map((warning) => warning.code)).toEqual(["POSITION_UNAVAILABLE"]);
  });

  it("休み希望の確認事項より先に出し、1セル1件を保つ", () => {
    const warnings = runWithProfiles([shift({ requestedTimes: [], positions: [kitchen()] })]);

    expect(warnings.map((warning) => warning.code)).toEqual(["POSITION_UNAVAILABLE"]);
  });

  it("希望時間外の確認事項より先に出し、1セル1件を保つ", () => {
    const warnings = runWithProfiles([shift({ ...requested, positions: [kitchen({ start: "08:00", end: "20:00" })] })]);

    expect(warnings.map((warning) => warning.code)).toEqual(["POSITION_UNAVAILABLE"]);
  });

  it("パターン選択の募集でも出す", () => {
    const warnings = runWithProfiles(
      [
        shift({
          requestedShiftTypeOptionIds: ["morning"],
          positions: [kitchen({ start: "17:00", end: "21:00", shiftTypeOptionId: "late" })],
        }),
      ],
      {
        kind: "shiftType",
        options: [
          { id: "morning", name: "早番" },
          { id: "late", name: "遅番" },
        ],
      },
    );

    expect(warnings).toEqual([
      {
        code: "POSITION_UNAVAILABLE",
        date: "2026-01-20",
        staffId: "staff1",
        message: "入れないポジションの勤務があります（キッチン）",
      },
    ]);
  });

  it("日付選択の募集でも出す", () => {
    const warnings = runWithProfiles([shift({ requestedTimes: [], positions: [kitchen()] })], { kind: "dateOnly" });

    expect(warnings.map((warning) => warning.code)).toEqual(["POSITION_UNAVAILABLE"]);
  });

  it("ポジションの一覧を渡さない場合は、勤務が持つポジション名を使う", () => {
    const warnings = computeAssignmentWarnings({
      shifts: [shift({ ...requested, positions: [kitchen({ positionName: "厨房" })] })],
      staffs: profiledStaffs,
      pattern: timePattern,
    });

    expect(warnings.map((warning) => warning.message)).toEqual(["入れないポジションの勤務があります（厨房）"]);
  });

  it("ポジションの一覧にある名前を、勤務が持つ古い名前より優先する", () => {
    const warnings = runWithProfiles([shift({ ...requested, positions: [kitchen({ positionName: "旧キッチン" })] })]);

    expect(warnings.map((warning) => warning.message)).toEqual(["入れないポジションの勤務があります（キッチン）"]);
  });

  it("入れるポジションへの割当では、既存の3種類の確認事項が変わらず出る", () => {
    const warnings = runWithProfiles([
      shift({ id: "shift-a", staffId: "staff2", date: "2026-01-20", positions: [seg({})] }),
      shift({ id: "shift-b", staffId: "staff1", date: "2026-01-21", requestedTimes: [], positions: [seg({})] }),
      shift({
        id: "shift-c",
        staffId: "staff1",
        date: "2026-01-22",
        ...requested,
        positions: [seg({ start: "10:00", end: "21:00" })],
      }),
      shift({ id: "shift-d", staffId: "staff1", date: "2026-01-23", ...requested, positions: [kitchen()] }),
    ]);

    expect(warnings).toEqual([
      { code: "NOT_SUBMITTED", date: "2026-01-20", staffId: "staff2", message: "未提出のまま勤務に入っています" },
      { code: "OFF_REQUEST", date: "2026-01-21", staffId: "staff1", message: "休み希望の日に勤務が入っています" },
      {
        code: "OUTSIDE_REQUESTED_TIME",
        date: "2026-01-22",
        staffId: "staff1",
        message: "希望時間（10:00-18:00）の外に勤務があります",
      },
      {
        code: "POSITION_UNAVAILABLE",
        date: "2026-01-23",
        staffId: "staff1",
        message: "入れないポジションの勤務があります（キッチン）",
      },
    ]);
  });

  it("勤務のないセルには出さない", () => {
    expect(runWithProfiles([shift({ ...requested, positions: [] })])).toEqual([]);
  });
});
