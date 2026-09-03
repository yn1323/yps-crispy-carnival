import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { buildConfirmationSnapshotSignature } from "./confirmationSnapshots";

describe("notification/mutations", () => {
  async function setupSubmitLinkTestData(t: TestConvex<typeof schema>) {
    return await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "提出店舗");
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-01-20",
        periodEnd: "2026-01-26",
        deadline: "2026-01-17",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "提出スタッフ",
        email: "submit@example.com",
        isDeleted: false,
      });
      return { shopId, staffId, recruitmentId };
    });
  }

  describe("createMagicLink", () => {
    it("24時間有効のマジックリンクが作成される", async () => {
      const t = convexTest(schema, modules);

      const { shopId, staffId, recruitmentId } = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "テスト店舗");
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-20",
          periodEnd: "2026-01-26",
          deadline: "2026-01-17",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "鈴木太郎",
          email: "suzuki@example.com",
          isDeleted: false,
        });
        return { shopId, staffId, recruitmentId };
      });

      const result = await t.mutation(internal.notification.mutations.createMagicLink, {
        staffId,
        shopId,
        recruitmentId,
        accessKind: "view",
      });

      expect(result.token).toBeDefined();
      expect(result.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

      // DBのレコードを確認
      await t.run(async (ctx) => {
        const magicLink = await ctx.db
          .query("magicLinks")
          .withIndex("by_token", (q) => q.eq("token", result.token))
          .first();
        if (!magicLink) throw new Error("magicLink not found");
        const twentyFourHoursMs = 24 * 60 * 60 * 1000;
        const diff = magicLink.expiresAt - Date.now();
        expect(diff).toBeGreaterThan(twentyFourHoursMs - 60000);
        expect(diff).toBeLessThanOrEqual(twentyFourHoursMs);
        expect(magicLink.accessKind).toBe("view");
      });
    });

    it("指定した用途と期限を保存する", async () => {
      const t = convexTest(schema, modules);
      const expiresAt = Date.now() + 123456;

      const { shopId, staffId, recruitmentId } = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "提出店舗");
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-20",
          periodEnd: "2026-01-26",
          deadline: "2026-01-17",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "提出スタッフ",
          email: "submit@example.com",
          isDeleted: false,
        });
        return { shopId, staffId, recruitmentId };
      });

      const result = await t.mutation(internal.notification.mutations.createMagicLink, {
        staffId,
        shopId,
        recruitmentId,
        accessKind: "submit",
        expiresAt,
      });

      const magicLink = await t.run(async (ctx) =>
        ctx.db
          .query("magicLinks")
          .withIndex("by_token", (q) => q.eq("token", result.token))
          .first(),
      );
      expect(magicLink).toMatchObject({ accessKind: "submit", expiresAt });
    });

    it("所属人物がremovedのスタッフにはリンクを発行せず、副作用を残さない", async () => {
      const t = convexTest(schema, modules);
      const ids = await setupSubmitLinkTestData(t);
      await t.run(async (ctx) => {
        const staff = await ctx.db.get(ids.staffId);
        if (!staff?.organizationPersonId) throw new Error("canonical staff person not found");
        await ctx.db.patch(staff.organizationPersonId, { status: "removed", updatedAt: Date.now() });
      });

      await expect(
        t.mutation(internal.notification.mutations.createMagicLink, {
          staffId: ids.staffId,
          shopId: ids.shopId,
          recruitmentId: ids.recruitmentId,
          accessKind: "submit",
        }),
      ).rejects.toThrow("Inactive notification scope");

      const state = await t.run(async (ctx) => ({
        magicLinks: await ctx.db.query("magicLinks").collect(),
        outbox: await ctx.db.query("notificationOutbox").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state).toEqual({ magicLinks: [], outbox: [], scheduled: [] });
    });
  });

  describe("getOrCreateSubmitMagicLink", () => {
    it("同一スタッフ・同一募集のsubmitリンクを再利用し、期限を更新する", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId, recruitmentId } = await setupSubmitLinkTestData(t);

      const first = await t.mutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId,
        shopId,
        recruitmentId,
        expiresAt: 1_000,
      });
      const second = await t.mutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId,
        shopId,
        recruitmentId,
        expiresAt: 2_000,
      });

      expect(second.token).toBe(first.token);
      const links = await t.run(async (ctx) => await ctx.db.query("magicLinks").collect());
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({ accessKind: "submit", expiresAt: 2_000 });
    });

    it("revoked済みのsubmitリンクは再利用しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId, recruitmentId } = await setupSubmitLinkTestData(t);

      const first = await t.mutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId,
        shopId,
        recruitmentId,
        expiresAt: 1_000,
      });
      await t.run(async (ctx) => {
        const link = await ctx.db
          .query("magicLinks")
          .withIndex("by_token", (q) => q.eq("token", first.token))
          .first();
        if (!link) throw new Error("magicLink not found");
        await ctx.db.patch(link._id, { revokedAt: 1_500 });
      });

      const second = await t.mutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId,
        shopId,
        recruitmentId,
        expiresAt: 2_000,
      });

      expect(second.token).not.toBe(first.token);
      const links = await t.run(async (ctx) => await ctx.db.query("magicLinks").collect());
      expect(links).toHaveLength(2);
    });

    it("viewリンクは再利用対象にしない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId, recruitmentId } = await setupSubmitLinkTestData(t);
      await t.mutation(internal.notification.mutations.createMagicLink, {
        staffId,
        shopId,
        recruitmentId,
        accessKind: "view",
        expiresAt: 1_000,
      });

      const submit = await t.mutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId,
        shopId,
        recruitmentId,
        expiresAt: 2_000,
      });

      const links = await t.run(async (ctx) => await ctx.db.query("magicLinks").collect());
      expect(links).toHaveLength(2);
      expect(links.find((link) => link.token === submit.token)?.accessKind).toBe("submit");
    });
  });

  describe("upsertConfirmationSnapshot compatibility", () => {
    it("現在のcanonical Outboxが実在する確定内容だけをsnapshotへ反映する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "snapshot compatibility店舗");
        const shop = await ctx.db.get(shopId);
        if (!shop) throw new Error("canonical shop fixture was not created");
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "snapshot compatibilityスタッフ",
          email: "snapshot-compatibility@example.com",
          isDeleted: false,
        });
        const positionId = await ctx.db.insert("positions", {
          shopId,
          name: "通常",
          color: "#3b82f6",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        });
        const currentOperationKey = "shift.confirmation:compatibility:current";
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-08-01",
          periodEnd: "2026-08-07",
          deadline: "2026-07-28",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: 1_000,
          draftSavedAt: 2_000,
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          lastConfirmationNotificationOperationKey: currentOperationKey,
        });
        const currentAssignments = [
          { date: "2026-08-02", startTime: "12:00", endTime: "16:00", positionId },
          { date: "2026-08-02", startTime: "16:00", endTime: "20:00", positionId },
        ];
        for (const assignment of currentAssignments) {
          await ctx.db.insert("shiftAssignments", { recruitmentId, staffId, ...assignment });
        }
        const oldAssignment = {
          date: "2026-08-01",
          startTime: "09:00",
          endTime: "17:00",
          positionId,
        };
        const snapshotId = await ctx.db.insert("shiftConfirmationSnapshots", {
          recruitmentId,
          staffId,
          signature: buildConfirmationSnapshotSignature([oldAssignment]),
          assignments: [oldAssignment],
          sentAt: 500,
          updatedAt: 500,
        });
        const insertOperation = async (operationKey: string) =>
          await ctx.db.insert("notificationFanoutOperations", {
            operationKey,
            kind: "confirmation",
            purpose: "confirmation",
            recruitmentId,
            shopId,
            targetStaffIds: [staffId],
            cursor: 1,
            status: "completed",
            dedupeSuffix: "confirm",
            supersedesActiveOperations: true,
            completedAt: 3_000,
            createdAt: 500,
            updatedAt: 3_000,
          });
        const oldOperationKey = "shift.confirmation:compatibility:old";
        const oldOperationId = await insertOperation(oldOperationKey);
        const currentOperationId = await insertOperation(currentOperationKey);
        await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "sent",
          dedupeKey: `email:confirmation:${recruitmentId}:${staffId}:old`,
          fanoutTargetKey: `fanout:${oldOperationKey}:${staffId}`,
          fanoutOperationId: oldOperationId,
          shopId,
          organizationId: shop.organizationId,
          recruitmentId,
          staffId,
          purpose: "business",
          notificationContext: "notification.sendConfirmationEmail",
          deliverySuppressed: false,
          payload: {
            kind: "email",
            from: "シフトリ <noreply@example.com>",
            to: "snapshot-compatibility@example.com",
            subject: "旧確定通知",
            html: "<p>旧確定通知</p>",
            context: "notification.sendConfirmationEmail",
          },
          attemptCount: 1,
          nextRunAt: 500,
          sentAt: 500,
          terminalAt: 500,
          createdAt: 500,
          updatedAt: 500,
        });
        return {
          shopId,
          organizationId: shop.organizationId,
          recruitmentId,
          staffId,
          snapshotId,
          currentOperationId,
          currentOperationKey,
          currentAssignments,
          canonicalAssignment: { date: "2026-08-02", startTime: "12:00", endTime: "20:00", positionId },
        };
      });
      const currentSignature = buildConfirmationSnapshotSignature(ids.currentAssignments);
      const canonicalSignature = buildConfirmationSnapshotSignature([ids.canonicalAssignment]);
      const args = {
        recruitmentId: ids.recruitmentId,
        staffId: ids.staffId,
        signature: currentSignature,
        assignments: ids.currentAssignments,
        sentAt: 4_000,
      };

      // A Outboxだけが存在しBはdirtyな間は、現在値Bを記録しない。
      await expect(t.mutation(internal.notification.mutations.upsertConfirmationSnapshot, args)).resolves.toBeNull();
      await t.run(async (ctx) => ctx.db.patch(ids.recruitmentId, { confirmedAt: 2_000 }));
      // cleanでもBのcanonical Outboxがなければ反映しない。
      await expect(t.mutation(internal.notification.mutations.upsertConfirmationSnapshot, args)).resolves.toBeNull();
      await expect(t.run(async (ctx) => ctx.db.get(ids.snapshotId))).resolves.toMatchObject({ sentAt: 500 });

      await t.run(async (ctx) => {
        await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "sent",
          dedupeKey: `email:confirmation:${ids.recruitmentId}:${ids.staffId}:current`,
          fanoutTargetKey: `fanout:${ids.currentOperationKey}:${ids.staffId}`,
          fanoutOperationId: ids.currentOperationId,
          shopId: ids.shopId,
          organizationId: ids.organizationId,
          recruitmentId: ids.recruitmentId,
          staffId: ids.staffId,
          purpose: "business",
          notificationContext: "notification.sendConfirmationEmail",
          deliverySuppressed: false,
          payload: {
            kind: "email",
            from: "シフトリ <noreply@example.com>",
            to: "snapshot-compatibility@example.com",
            subject: "現在の確定通知",
            html: "<p>現在の確定通知</p>",
            context: "notification.sendConfirmationEmail",
          },
          attemptCount: 1,
          nextRunAt: 4_000,
          sentAt: 4_000,
          terminalAt: 4_000,
          createdAt: 4_000,
          updatedAt: 4_000,
        });
      });

      await expect(t.mutation(internal.notification.mutations.upsertConfirmationSnapshot, args)).resolves.toBe(
        ids.snapshotId,
      );
      await expect(t.run(async (ctx) => ctx.db.get(ids.snapshotId))).resolves.toMatchObject({
        signature: canonicalSignature,
        assignments: [ids.canonicalAssignment],
        sentAt: 4_000,
      });
      await expect(
        t.mutation(internal.notification.mutations.upsertConfirmationSnapshot, { ...args, sentAt: 5_000 }),
      ).resolves.toBe(ids.snapshotId);
      await expect(t.run(async (ctx) => ctx.db.get(ids.snapshotId))).resolves.toMatchObject({ sentAt: 4_000 });

      const emptyOptionAssignment = { ...ids.canonicalAssignment, optionId: "" };
      await t.run(async (ctx) => {
        const assignments = await ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId_staffId", (q) =>
            q.eq("recruitmentId", ids.recruitmentId).eq("staffId", ids.staffId),
          )
          .collect();
        if (assignments.length !== 2) throw new Error("presence compatibility fixture is invalid");
        await ctx.db.patch(assignments[0]._id, {
          startTime: emptyOptionAssignment.startTime,
          endTime: emptyOptionAssignment.endTime,
          optionId: "",
        });
        await ctx.db.delete(assignments[1]._id);
      });
      const emptyOptionArgs = {
        ...args,
        assignments: [emptyOptionAssignment],
        signature: buildConfirmationSnapshotSignature([emptyOptionAssignment]),
        sentAt: 6_000,
      };
      // legacy signatureはmissingと同じでも、time semanticのpresence差をhealする。
      expect(emptyOptionArgs.signature).toBe(canonicalSignature);
      await expect(
        t.mutation(internal.notification.mutations.upsertConfirmationSnapshot, emptyOptionArgs),
      ).resolves.toBe(ids.snapshotId);
      await expect(t.run(async (ctx) => ctx.db.get(ids.snapshotId))).resolves.toMatchObject({
        signature: canonicalSignature,
        assignments: [emptyOptionAssignment],
        sentAt: 6_000,
      });
      await expect(
        t.mutation(internal.notification.mutations.upsertConfirmationSnapshot, {
          ...emptyOptionArgs,
          sentAt: 7_000,
        }),
      ).resolves.toBe(ids.snapshotId);
      await expect(t.run(async (ctx) => ctx.db.get(ids.snapshotId))).resolves.toMatchObject({ sentAt: 6_000 });
    });
  });
});
