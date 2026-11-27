import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { MANAGER_SUBJECT, SCENARIO_NOW, scenarioDate, seedSession, seedStaff } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

// SCENARIO_NOW（2026-05-10）は日曜日。募集を翌週の日曜（05-17）から土曜（05-23）に置く。
const SUNDAY = scenarioDate(7);
const MONDAY = scenarioDate(8);
const SATURDAY = scenarioDate(13);

const bar = (positionId: Id<"positions">, startTime: string, endTime: string) => ({ positionId, startTime, endTime });

describe("確定した時点のポジションシナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("募集を確定したあとでポジションの名前を変えて削除しても、確定済みのシフト表は確定した時点のポジションと必要人数のまま返し、再確定しても変わらず、未確定の募集だけが変更を反映する", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    // Arrange: ポジションを2つ持つ店舗（時間指定 09:00-22:00）に、スタッフを1人置く。
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "positions-manager@example.com",
        shopName: "ポジションの店舗",
      });
      const insertPosition = (name: string, color: string, sortOrder: number) =>
        ctx.db.insert("positions", { shopId, name, color, sortOrder, isDefault: sortOrder === 0, isDeleted: false });
      const hallPositionId = await insertPosition("ホール", "#3b82f6", 0);
      const kitchenPositionId = await insertPosition("キッチン", "#c2410c", 1);
      const staffId = await seedStaff(ctx, { shopId, name: "スタッフ", email: "positions-staff@example.com" });
      return { shopId, hallPositionId, kitchenPositionId, staffId };
    });
    const requirements = {
      kind: "time" as const,
      bars: [bar(ids.hallPositionId, "09:00", "17:00"), bar(ids.kitchenPositionId, "11:00", "22:00")],
    };
    await asManager.saveDayTemplates([
      {
        name: "毎日",
        weekdays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        appliesToHolidays: false,
        requirements,
      },
    ]);
    const recruitmentId = await asManager.createRecruitment({
      periodStart: SUNDAY,
      periodEnd: SATURDAY,
      deadline: scenarioDate(3),
    });
    const kitchenShift = {
      staffId: ids.staffId,
      date: MONDAY,
      startTime: "11:00",
      endTime: "15:00",
      positionId: ids.kitchenPositionId,
    };
    await asManager.saveShiftAssignments({ recruitmentId, assignments: [kitchenShift] });

    // Act: シフトを確定し、そのあとでホールの名前と色を変え、キッチンを削除する。
    vi.setSystemTime(SCENARIO_NOW + 1_000);
    await asManager.confirmRecruitment(recruitmentId);
    vi.setSystemTime(SCENARIO_NOW + 2_000);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.hallPositionId, { name: "フロア", color: "#7c3aed" });
      await ctx.db.patch(ids.kitchenPositionId, { isDeleted: true });
    });

    // Assert: 確定済みのシフト表は、確定した時点の名前と色で、削除したポジションも含めて返す。
    const confirmedPositions = [
      { _id: ids.hallPositionId, name: "ホール", color: "#3b82f6", isDefault: true },
      { _id: ids.kitchenPositionId, name: "キッチン", color: "#c2410c", isDefault: false },
    ];
    const confirmedBoard = await asManager.getShiftBoardData(recruitmentId);
    expect(confirmedBoard?.positions).toEqual(confirmedPositions);
    expect(confirmedBoard?.shiftAssignments).toEqual([expect.objectContaining(kitchenShift)]);
    // 削除したポジションの必要人数も、確定済みのシフト表から消えない。
    const confirmedStaffing = await asManager.getShiftBoardStaffing(recruitmentId);
    expect(confirmedStaffing?.days.find((day) => day.date === MONDAY)?.requirements).toEqual(requirements);

    // Act: 確定済みのシフトで、削除したポジションの勤務の時間を直して保存し、確定し直す。
    const movedKitchenShift = { ...kitchenShift, endTime: "16:00" };
    await asManager.saveShiftAssignments({ recruitmentId, assignments: [movedKitchenShift] });
    vi.setSystemTime(SCENARIO_NOW + 3_000);
    await asManager.confirmRecruitment(recruitmentId);

    // Assert: 削除したポジションのまま保存でき、確定し直しても確定した時点のポジションは書き直さない。
    const reconfirmedBoard = await asManager.getShiftBoardData(recruitmentId);
    expect(reconfirmedBoard?.positions).toEqual(confirmedPositions);
    expect(reconfirmedBoard?.shiftAssignments).toEqual([expect.objectContaining(movedKitchenShift)]);

    // Act: 次の週の募集を作る。
    const nextRecruitmentId = await asManager.createRecruitment({
      periodStart: scenarioDate(14),
      periodEnd: scenarioDate(20),
      deadline: scenarioDate(4),
    });

    // Assert: 未確定の募集は、いまの設定のポジションだけを返し、削除したポジションの勤務を受け付けない。
    const nextBoard = await asManager.getShiftBoardData(nextRecruitmentId);
    expect(nextBoard?.positions).toEqual([
      { _id: ids.hallPositionId, name: "フロア", color: "#7c3aed", isDefault: true },
    ]);
    await expect(
      asManager.saveShiftAssignments({
        recruitmentId: nextRecruitmentId,
        assignments: [{ ...kitchenShift, date: scenarioDate(15) }],
      }),
    ).rejects.toThrowError("Not found");
  });

  it("確定した時点のポジションを持たない確定済みの募集は、管理者のシフト表でも、スタッフの確定シフトでも、いまの設定のポジションを返す", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const staff = scenario.staff();

    // Arrange: 既定のポジションに勤務がある募集を確定し、確定した時点のポジションを外す（この項目より前に確定した募集にあたる）。
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "legacy-manager@example.com",
        shopName: "以前に確定した店舗",
      });
      const hallPositionId = await ctx.db.insert("positions", {
        shopId,
        name: "ホール",
        color: "#3b82f6",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const staffId = await seedStaff(ctx, { shopId, name: "スタッフ", email: "legacy-staff@example.com" });
      return { shopId, hallPositionId, staffId };
    });
    const recruitmentId = await asManager.createRecruitment({
      periodStart: SUNDAY,
      periodEnd: SATURDAY,
      deadline: scenarioDate(3),
    });
    const hallShift = {
      staffId: ids.staffId,
      date: MONDAY,
      startTime: "10:00",
      endTime: "15:00",
      positionId: ids.hallPositionId,
    };
    await asManager.saveShiftAssignments({ recruitmentId, assignments: [hallShift] });
    await asManager.confirmRecruitment(recruitmentId);
    await t.run(async (ctx) => {
      await ctx.db.patch(recruitmentId, { confirmedPositions: undefined });
      await seedSession(ctx, {
        sessionToken: "legacy-confirmed-view-session",
        staffId: ids.staffId,
        shopId: ids.shopId,
        recruitmentId,
        accessKind: "view",
      });
    });

    // Act: 確定したあとで、既定のポジションの名前を変える。
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.hallPositionId, { name: "フロア" });
    });

    // Assert: 管理者のシフト表も、スタッフの確定シフトも、変えたあとの名前で返す。
    const currentPositions = [{ _id: ids.hallPositionId, name: "フロア", color: "#3b82f6", isDefault: true }];
    const board = await asManager.getShiftBoardData(recruitmentId);
    expect(board?.positions).toEqual(currentPositions);
    const staffView = await staff.getShiftViewData({ sessionToken: "legacy-confirmed-view-session", recruitmentId });
    expect(staffView?.positions).toEqual(currentPositions);
    expect(staffView?.assignments).toEqual([expect.objectContaining(hallShift)]);
  });
});
