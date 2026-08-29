import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { createMigrationHistoryTestWithMigrations } from "../_test/migrations.test-helper";
import { inspectLiveLineInviteCaller } from "./queries";

const page = { cursor: null, numItems: 100 };

describe("LINE common link readiness queries", () => {
  it("公開を停める複数店舗・複数所属・legacy counterpart欠損をPIIなしで数える", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const secretLineUserId = "line-readiness-secret";
    await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        name: "確認グループ",
        billingEmail: "readiness@example.com",
        billingEmailNormalized: "readiness@example.com",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "確認対象",
        email: "readiness@example.com",
        emailNormalized: "readiness@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const shopIds = [];
      for (const name of ["店舗A", "店舗B"]) {
        shopIds.push(
          await ctx.db.insert("shops", {
            organizationId,
            name,
            regularClosedDays: [],
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
            isDeleted: false,
          }),
        );
      }
      for (const [index, shopId] of shopIds.entries()) {
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          organizationId,
          organizationPersonId: personId,
          name: `スタッフ${index}`,
          email: "readiness@example.com",
          emailNormalized: "readiness@example.com",
          excludedFromShift: false,
          isDeleted: false,
        });
        if (index === 0) {
          await ctx.db.insert("staffLineAccounts", {
            staffId,
            shopId,
            lineUserId: secretLineUserId,
            linkedAt: now,
            following: true,
            isDeleted: false,
          });
        }
      }
    });

    const [organizations, people, legacy] = await Promise.all([
      t.query(internal.narrowReadiness.queries.verifyLineCommonOrganizations, { paginationOpts: page }),
      t.query(internal.narrowReadiness.queries.verifyLineCommonPeople, { paginationOpts: page }),
      t.query(internal.narrowReadiness.queries.verifyLineCommonLegacyAccounts, { paginationOpts: page }),
    ]);

    expect(organizations.anomalies).toEqual({ activeOrganizationsWithMultipleShops: 1 });
    expect(people.anomalies.activePeopleWithMultipleStaffs).toBe(1);
    expect(legacy.observations).toMatchObject({
      activeLegacyAccounts: 1,
      activeLegacyWithoutCanonicalCounterpart: 1,
    });
    expect(JSON.stringify([organizations, people, legacy])).not.toContain(secretLineUserId);
  });

  it("旧shapeと片欠けsnapshotを別pageで数え、片欠けを異常にする", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        name: "確認グループ",
        billingEmail: "async@example.com",
        billingEmailNormalized: "async@example.com",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "確認対象",
        email: "async@example.com",
        emailNormalized: "async@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        name: "確認店",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        isDeleted: false,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        organizationId,
        organizationPersonId: personId,
        name: "確認対象",
        email: "async@example.com",
        emailNormalized: "async@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
      await ctx.db.insert("lineLinkTokens", {
        staffId,
        shopId,
        token: "secret-old-token",
        expiresAt: now + 60_000,
      });
      await ctx.db.insert("lineLinkTokens", {
        staffId,
        shopId,
        organizationId,
        token: "secret-incomplete-token",
        expiresAt: now + 60_000,
      });
      await ctx.db.insert("notificationOutbox", {
        channel: "line",
        status: "pending",
        dedupeKey: "old-line-job",
        shopId,
        organizationId,
        staffId,
        purpose: "business",
        notificationContext: "readiness.test",
        deliverySuppressed: false,
        payload: { kind: "line", toUserId: "secret-line-user", text: "test" },
        attemptCount: 0,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("notificationOutbox", {
        channel: "line",
        status: "pending",
        dedupeKey: "incomplete-line-job",
        shopId,
        organizationId,
        staffId,
        purpose: "business",
        organizationPersonLineGenerationAtEnqueue: 0,
        notificationContext: "readiness.test",
        deliverySuppressed: false,
        payload: { kind: "line", toUserId: "secret-line-user", text: "test" },
        attemptCount: 0,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    const [tokens, outbox] = await Promise.all([
      t.query(internal.narrowReadiness.queries.verifyLineCommonAsyncCompatibility, {
        paginationOpts: page,
        table: "tokens",
      }),
      t.query(internal.narrowReadiness.queries.verifyLineCommonAsyncCompatibility, {
        paginationOpts: page,
        table: "outbox",
      }),
    ]);
    expect(tokens.observations.oldUnusedTokens).toBe(2);
    expect(tokens.anomalies.incompleteUnusedTokenSnapshots).toBe(1);
    expect(outbox.observations.activeLineOutboxWithoutGeneration).toBe(2);
    expect(outbox.anomalies.incompleteActiveLineOutboxSnapshots).toBe(1);
    expect(JSON.stringify([tokens, outbox])).not.toContain("secret");
  });

  it.each(["pending", "inProgress"])("%sのLINE招待をlive callerとしてsnapshot検査する", (kind) => {
    const base = { name: "line/actions:sendInviteEmail", state: { kind } };
    expect(inspectLiveLineInviteCaller({ ...base, args: [{ staffId: "staff" }] })).toEqual({
      oldShape: true,
      incompleteSnapshot: false,
    });
    expect(
      inspectLiveLineInviteCaller({
        ...base,
        args: [{ staffId: "staff", organizationPersonId: "person" }],
      }),
    ).toEqual({ oldShape: false, incompleteSnapshot: true });
    expect(
      inspectLiveLineInviteCaller({
        ...base,
        args: [{ staffId: "staff", organizationPersonId: "person", lineLinkGenerationAtSchedule: 2 }],
      }),
    ).toEqual({ oldShape: false, incompleteSnapshot: false });
  });

  it("完了済みとLINE以外の予約はlive callerへ数えない", () => {
    expect(
      inspectLiveLineInviteCaller({
        name: "line/actions:sendInviteEmail",
        state: { kind: "success" },
        args: [{ staffId: "staff" }],
      }),
    ).toBeNull();
    expect(
      inspectLiveLineInviteCaller({
        name: "notification/actions:sendEmail",
        state: { kind: "pending" },
        args: [{}],
      }),
    ).toBeNull();
  });

  it("削除済み店舗のstaff履歴を現在の複数所属へ数えない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        name: "履歴確認グループ",
        billingEmail: "history@example.com",
        billingEmailNormalized: "history@example.com",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "履歴確認対象",
        email: "history@example.com",
        emailNormalized: "history@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      for (let index = 0; index < 2; index += 1) {
        const shopId = await ctx.db.insert("shops", {
          organizationId,
          name: `履歴店舗${index}`,
          regularClosedDays: [],
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
          isDeleted: index === 1,
        });
        await ctx.db.insert("staffs", {
          shopId,
          organizationId,
          organizationPersonId: personId,
          name: "履歴確認対象",
          email: "history@example.com",
          emailNormalized: "history@example.com",
          excludedFromShift: false,
          isDeleted: false,
        });
      }
    });

    const result = await t.query(internal.narrowReadiness.queries.verifyLineCommonPeople, {
      paginationOpts: page,
    });
    expect(result.anomalies.activePeopleWithMultipleStaffs).toBe(0);
  });

  it("active所属のcanonical linkだけをlegacy projection欠損として数え、所属0件の保持linkは許可する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        name: "投影確認グループ",
        billingEmail: "projection@example.com",
        billingEmailNormalized: "projection@example.com",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        name: "投影確認店",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        isDeleted: false,
      });
      for (const [index, withStaff] of [true, false].entries()) {
        const providerId = await ctx.db.insert("lineProviderUsers", {
          lineUserId: `projection-secret-${index}`,
          following: true,
          stateVersion: 1,
          friendshipObservedAt: now,
          friendshipObservationSource: "oauth",
          isDeleted: false,
        });
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId,
          name: `投影確認対象${index}`,
          email: `projection-${index}@example.com`,
          emailNormalized: `projection-${index}@example.com`,
          status: "active",
          lineLinkGeneration: 1,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("organizationPersonLineLinks", {
          organizationId,
          organizationPersonId: personId,
          lineProviderUserId: providerId,
          generation: 1,
          linkedAt: now,
          isDeleted: false,
        });
        if (withStaff) {
          await ctx.db.insert("staffs", {
            shopId,
            organizationId,
            organizationPersonId: personId,
            name: `投影確認対象${index}`,
            email: `projection-${index}@example.com`,
            emailNormalized: `projection-${index}@example.com`,
            excludedFromShift: false,
            isDeleted: false,
          });
        }
      }
    });

    const result = await t.query(internal.narrowReadiness.queries.verifyLineCommonPeople, {
      paginationOpts: page,
    });
    expect(result.anomalies.activeCanonicalLinkWithoutExactLegacyProjection).toBe(1);
    expect(JSON.stringify(result)).not.toContain("projection-secret");
  });

  it("active provider userのraw ID重複をgroup単位で数え、PIIを返さない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const secretLineUserId = "duplicate-provider-secret";
    await t.run(async (ctx) => {
      for (let index = 0; index < 2; index += 1) {
        await ctx.db.insert("lineProviderUsers", {
          lineUserId: secretLineUserId,
          following: true,
          stateVersion: 1,
          friendshipObservedAt: Date.now(),
          friendshipObservationSource: "oauth",
          isDeleted: false,
        });
      }
    });

    const result = await t.query(internal.narrowReadiness.queries.verifyLineCommonProviders, {
      paginationOpts: page,
    });
    expect(result.anomalies.duplicateActiveProviderUserGroups).toBe(1);
    expect(result.observations.activeProviderUsers).toBe(2);
    expect(JSON.stringify(result)).not.toContain(secretLineUserId);
  });
});
