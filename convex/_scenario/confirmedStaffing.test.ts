import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { MANAGER_SUBJECT, SCENARIO_NOW, scenarioDate, seedStaff } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

// SCENARIO_NOW（2026-05-10）は日曜日。募集を翌週の日曜（05-17）から土曜（05-23）に置く。
const SUNDAY = scenarioDate(7);
const MONDAY = scenarioDate(8);
const TUESDAY = scenarioDate(9);
const WEDNESDAY = scenarioDate(10);
const THURSDAY = scenarioDate(11);
const FRIDAY = scenarioDate(12);
const SATURDAY = scenarioDate(13);

const bar = (positionId: Id<"positions">, startTime: string, endTime: string) => ({ positionId, startTime, endTime });

describe("確定した時点の必要人数シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("テンプレートを保存して募集を確定したあとで、テンプレートと祝日を変えても、確定済みのシフト表は確定した時点の必要人数のまま返し、未確定の募集だけが変更を反映する", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    // Arrange: ポジションを2つ持つ店舗（時間指定 09:00-22:00）に、スタッフを1人置く。
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "staffing-manager@example.com",
        shopName: "必要人数の店舗",
      });
      const insertPosition = (name: string, sortOrder: number) =>
        ctx.db.insert("positions", {
          shopId,
          name,
          color: "#3b82f6",
          sortOrder,
          isDefault: sortOrder === 0,
          isDeleted: false,
        });
      const hallPositionId = await insertPosition("ホール", 0);
      const kitchenPositionId = await insertPosition("キッチン", 1);
      await seedStaff(ctx, { shopId, name: "スタッフ", email: "staffing-staff@example.com" });
      return { shopId, hallPositionId, kitchenPositionId };
    });
    const weekdayRequirements = {
      kind: "time" as const,
      bars: [bar(ids.hallPositionId, "09:00", "17:00"), bar(ids.hallPositionId, "11:00", "14:00")],
    };
    const weekendRequirements = {
      kind: "time" as const,
      bars: [bar(ids.hallPositionId, "10:00", "22:00"), bar(ids.kitchenPositionId, "11:00", "22:00")],
    };
    const customRequirements = { kind: "time" as const, bars: [bar(ids.kitchenPositionId, "17:00", "21:00")] };

    // Act: 平日と週末のテンプレートを保存し、募集を作る。月曜に週末のテンプレートを当て、火曜はその日だけの必要人数にする。
    await asManager.saveDayTemplates([
      {
        name: "平日",
        weekdays: ["mon", "tue", "wed", "thu", "fri"],
        appliesToHolidays: false,
        requirements: weekdayRequirements,
      },
      { name: "週末", weekdays: ["sat", "sun"], appliesToHolidays: false, requirements: weekendRequirements },
    ]);
    const savedSetup = await asManager.getShiftSetup();
    const weekdayTemplateId = savedSetup?.dayTemplates.find((template) => template.name === "平日")?._id;
    const weekendTemplateId = savedSetup?.dayTemplates.find((template) => template.name === "週末")?._id;
    if (!weekdayTemplateId || !weekendTemplateId) throw new Error("expected the saved day templates");
    const recruitmentId = await asManager.createRecruitment({
      periodStart: SUNDAY,
      periodEnd: SATURDAY,
      deadline: scenarioDate(3),
    });
    await asManager.applyDayTemplateToDates({ recruitmentId, dates: [MONDAY], templateId: weekendTemplateId });
    await asManager.saveDayCustomRequirements({ recruitmentId, date: TUESDAY, requirements: customRequirements });

    // Assert: 未確定のシフト表は、日ごとに決めた理由と必要人数を返す。
    const weekday = { templateId: weekdayTemplateId, templateName: "平日", requirements: weekdayRequirements };
    const weekend = { templateId: weekendTemplateId, templateName: "週末", requirements: weekendRequirements };
    const custom = { templateId: null, templateName: null, requirements: customRequirements };
    const openStaffing = await asManager.getShiftBoardStaffing(recruitmentId);
    expect(openStaffing?.isLocked).toBe(false);
    expect(openStaffing?.days).toEqual([
      { date: SUNDAY, source: "weekday", ...weekend },
      { date: MONDAY, source: "dateTemplate", ...weekend },
      { date: TUESDAY, source: "dateCustom", ...custom },
      { date: WEDNESDAY, source: "weekday", ...weekday },
      { date: THURSDAY, source: "weekday", ...weekday },
      { date: FRIDAY, source: "weekday", ...weekday },
      { date: SATURDAY, source: "weekday", ...weekend },
    ]);

    // Act: シフトを確定する。
    vi.setSystemTime(SCENARIO_NOW + 1_000);
    const confirmResult = await asManager.confirmRecruitment(recruitmentId);

    // Assert: 確定済みのシフト表は、確定した時点の必要人数とテンプレートの名前を、テンプレートと結び付けずに返す。
    expect(confirmResult).toEqual({ status: "scheduled", notifiedStaffCount: 1 });
    const confirmedDays = [
      { date: SUNDAY, ...weekend },
      { date: MONDAY, ...weekend },
      { date: TUESDAY, ...custom },
      { date: WEDNESDAY, ...weekday },
      { date: THURSDAY, ...weekday },
      { date: FRIDAY, ...weekday },
      { date: SATURDAY, ...weekend },
    ].map((day) => ({ ...day, source: "confirmed", templateId: null }));
    const confirmedStaffing = await asManager.getShiftBoardStaffing(recruitmentId);
    expect(confirmedStaffing?.isLocked).toBe(true);
    expect(confirmedStaffing?.days).toEqual(confirmedDays);

    // Act: 確定のあとで、平日のテンプレートを直し、週末のテンプレートを消して祝日のテンプレートを足し、水曜を祝日にする。
    vi.setSystemTime(SCENARIO_NOW + 2_000);
    const changedWeekdayRequirements = {
      kind: "time" as const,
      bars: [bar(ids.kitchenPositionId, "09:00", "22:00")],
    };
    const holidayRequirements = { kind: "time" as const, bars: [bar(ids.hallPositionId, "12:00", "20:00")] };
    await asManager.saveDayTemplates([
      {
        id: weekdayTemplateId,
        name: "平日（改）",
        weekdays: ["mon", "tue", "wed", "thu", "fri"],
        appliesToHolidays: false,
        requirements: changedWeekdayRequirements,
      },
      { name: "祝日", weekdays: [], appliesToHolidays: true, requirements: holidayRequirements },
    ]);
    await t.mutation(internal.nationalHoliday.mutations.replaceNationalHolidaysForYear, {
      year: 2026,
      holidays: [
        { date: WEDNESDAY, name: "確定のあとで足した祝日" },
        { date: scenarioDate(17), name: "次の募集の祝日" },
      ],
    });

    // Assert: 確定済みの募集では、テンプレートの当て直しと、その日だけの必要人数の保存を受け付けない。
    await expect(
      asManager.applyDayTemplateToDates({ recruitmentId, dates: [THURSDAY], templateId: weekdayTemplateId }),
    ).rejects.toThrowError("確定済みのシフトでは、必要人数を変更できません。");
    await expect(
      asManager.saveDayCustomRequirements({ recruitmentId, date: THURSDAY, requirements: customRequirements }),
    ).rejects.toThrowError("確定済みのシフトでは、必要人数を変更できません。");

    // Assert: 確定済みのシフト表は、テンプレートと祝日を変えたあとも、確定した時点の必要人数のまま返す。
    const afterChangeStaffing = await asManager.getShiftBoardStaffing(recruitmentId);
    expect(afterChangeStaffing?.isLocked).toBe(true);
    expect(afterChangeStaffing?.days).toEqual(confirmedDays);

    // Act: 次の週の募集を作る。
    const nextRecruitmentId = await asManager.createRecruitment({
      periodStart: scenarioDate(14),
      periodEnd: scenarioDate(20),
      deadline: scenarioDate(4),
    });

    // Assert: 未確定の募集は、直したあとのテンプレートと祝日から必要人数を決める。テンプレートを消した週末は未設定になる。
    const changedSetup = await asManager.getShiftSetup();
    const holidayTemplateId = changedSetup?.dayTemplates.find((template) => template.name === "祝日")?._id;
    if (!holidayTemplateId) throw new Error("expected the saved holiday template");
    const changedWeekday = {
      source: "weekday",
      templateId: weekdayTemplateId,
      templateName: "平日（改）",
      requirements: changedWeekdayRequirements,
    };
    const unset = { source: "none", templateId: null, templateName: null, requirements: null };
    const nextStaffing = await asManager.getShiftBoardStaffing(nextRecruitmentId);
    expect(nextStaffing?.isLocked).toBe(false);
    expect(nextStaffing?.templates).toEqual([
      { _id: weekdayTemplateId, name: "平日（改）" },
      { _id: holidayTemplateId, name: "祝日" },
    ]);
    expect(nextStaffing?.days).toEqual([
      { date: scenarioDate(14), ...unset },
      { date: scenarioDate(15), ...changedWeekday },
      { date: scenarioDate(16), ...changedWeekday },
      {
        date: scenarioDate(17),
        source: "holiday",
        templateId: holidayTemplateId,
        templateName: "祝日",
        requirements: holidayRequirements,
      },
      { date: scenarioDate(18), ...changedWeekday },
      { date: scenarioDate(19), ...changedWeekday },
      { date: scenarioDate(20), ...unset },
    ]);
  });
});
