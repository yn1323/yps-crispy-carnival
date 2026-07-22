import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT } from "../constants";
import { collectPersonRemovalPreview } from "./personRemoval";

describe("organization/personRemoval", () => {
  it("安全上限を超える今日以降の割当は部分集合やfingerprintを返さない", async () => {
    const t = convexTest(schema, modules);
    const preview = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "person_removal_limit",
        plan: "pro",
      });
      const staffId = await ctx.db.insert("staffs", {
        organizationId: base.organizationId,
        organizationPersonId: base.personId,
        shopId: base.shopId,
        name: "上限確認スタッフ",
        email: "person-removal-limit@example.com",
        emailNormalized: "person-removal-limit@example.com",
        isDeleted: false,
      });
      const staff = await ctx.db.get(staffId);
      if (!staff) throw new Error("staff not found");
      const positionId = await ctx.db.insert("positions", {
        shopId: base.shopId,
        name: "通常",
        color: "#000000",
        sortOrder: 0,
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: base.shopId,
        periodStart: "2099-01-01",
        periodEnd: "2099-01-01",
        deadline: "2098-12-31",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      for (let index = 0; index <= ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT; index += 1) {
        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId,
          date: "2099-01-01",
          startTime: "10:00",
          endTime: "18:00",
          positionId,
        });
      }
      return await collectPersonRemovalPreview(ctx, {
        scope: {
          kind: "organization",
          organizationId: base.organizationId,
          personId: base.personId,
        },
        staffs: [staff],
        asOfDate: "2099-01-01",
      });
    });

    expect(preview).toEqual({
      kind: "tooMany",
      asOfDate: "2099-01-01",
      assignmentCountAtLeast: ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT + 1,
      limit: ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT,
    });
    expect(preview).not.toHaveProperty("assignmentIds");
    expect(preview).not.toHaveProperty("fingerprint");
  });
});
