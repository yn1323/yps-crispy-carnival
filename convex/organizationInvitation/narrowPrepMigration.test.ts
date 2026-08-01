import type { MigrationArgs, MigrationResult } from "@convex-dev/migrations";
import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { createMigrationHistoryTestWithMigrations } from "../_test/migrations.test-helper";
import { seedOrganizationManagerShop } from "../_test/seed";

const m023Migration = makeFunctionReference<"mutation", MigrationArgs, MigrationResult>(
  "migrations/m023_organization_invitations_narrow_prep:migration",
);
const migrationArgs = { batchSize: 100, cursor: null, dryRun: false } as const;

type InvitationInsert = Omit<Doc<"organizationInvitations">, "_creationTime" | "_id">;
type MigrationInvitationView = {
  _id: Id<"organizationInvitations">;
  invitedName?: string;
  purpose?: "managerAddition" | "freeManagerExchange";
  status: "pending" | "accepted" | "issued" | "linked" | "revoked" | "expired";
  linkedAt?: number;
  linkedByPersonId?: Id<"organizationPeople">;
  acceptedAt?: number;
  acceptedByPersonId?: Id<"organizationPeople">;
};

describe("m023 organization invitation Narrow preparation migration", () => {
  it("旧shapeを正規化し、正規fieldを保全して、強制再実行でも副作用を重複させない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "invitation_m023_owner",
        plan: "pro",
      });
      const now = 1_800_000_000_000;
      const canonicalLinkedPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "既存の連携者",
        email: "linked-person@example.com",
        emailNormalized: "linked-person@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const common = {
        organizationId: base.organizationId,
        inviterMemberId: base.memberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      };

      const pendingInvitationId = await ctx.db.insert("organizationInvitations", {
        ...common,
        email: "new-person@example.com",
        emailNormalized: "new-person@example.com",
        tokenDigest: "m023-legacy-pending-digest",
        status: "pending",
        // linkedしていない招待に残った旧連携情報は、競合証跡として保持する。
        acceptedAt: now - 300,
        acceptedByPersonId: base.personId,
      } as unknown as InvitationInsert);
      const acceptedInvitationId = await ctx.db.insert("organizationInvitations", {
        ...common,
        email: "owner@example.com",
        emailNormalized: "owner@example.com",
        tokenDigest: "m023-legacy-accepted-digest",
        status: "accepted",
        targetPersonId: base.personId,
        acceptedAt: now - 200,
        acceptedByPersonId: base.personId,
      } as unknown as InvitationInsert);
      const linkedInvitationId = await ctx.db.insert("organizationInvitations", {
        ...common,
        email: "linked@example.com",
        emailNormalized: "linked@example.com",
        invitedName: "既存の招待名",
        tokenDigest: "m023-linked-digest",
        status: "linked",
        purpose: "freeManagerExchange",
        linkedAt: now - 100,
        linkedByPersonId: canonicalLinkedPersonId,
        // 正規fieldと矛盾する旧値は上書きせず、運用修復のため両方を保持する。
        acceptedAt: now - 50,
        acceptedByPersonId: base.personId,
      } as unknown as InvitationInsert);

      return {
        ...base,
        acceptedInvitationId,
        canonicalLinkedPersonId,
        linkedInvitationId,
        pendingInvitationId,
        now,
      };
    });

    const firstRun = await t.mutation(m023Migration, migrationArgs);
    expect(firstRun.processed).toBe(3);
    const firstSnapshot = await readMigrationSnapshot(t, seeded.organizationId, {
      accepted: seeded.acceptedInvitationId,
      linked: seeded.linkedInvitationId,
      pending: seeded.pendingInvitationId,
    });

    expect(firstSnapshot).toEqual({
      invitations: {
        accepted: {
          acceptedAt: undefined,
          acceptedByPersonId: undefined,
          invitedName: "管理者",
          linkedAt: seeded.now - 200,
          linkedByPersonId: seeded.personId,
          purpose: "managerAddition",
          status: "linked",
        },
        linked: {
          acceptedAt: seeded.now - 50,
          acceptedByPersonId: seeded.personId,
          invitedName: "既存の招待名",
          linkedAt: seeded.now - 100,
          linkedByPersonId: seeded.canonicalLinkedPersonId,
          purpose: "freeManagerExchange",
          status: "linked",
        },
        pending: {
          acceptedAt: seeded.now - 300,
          acceptedByPersonId: seeded.personId,
          invitedName: "new-person",
          linkedAt: undefined,
          linkedByPersonId: undefined,
          purpose: "managerAddition",
          status: "issued",
        },
      },
      invitationCount: 3,
      peopleCount: 2,
      audits: [],
      conflicts: [
        "invitation_accepted_fields_on_unlinked_status",
        "invitation_linked_at_mismatch",
        "invitation_linked_by_person_mismatch",
      ],
    });

    // 完了済みstatusをresetし、全documentをもう一度通して冪等性を直接確認する。
    const secondRun = await t.mutation(m023Migration, { ...migrationArgs, reset: true });
    expect(secondRun.processed).toBe(3);
    expect(
      await readMigrationSnapshot(t, seeded.organizationId, {
        accepted: seeded.acceptedInvitationId,
        linked: seeded.linkedInvitationId,
        pending: seeded.pendingInvitationId,
      }),
    ).toEqual(firstSnapshot);
  });

  it("連携証跡が欠けたacceptedをlinkedへ推測変換しない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "invitation_m023_missing_evidence",
        plan: "pro",
      });
      const now = 1_800_000_100_000;
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "missing-evidence@example.com",
        emailNormalized: "missing-evidence@example.com",
        tokenDigest: "m023-missing-evidence-digest",
        status: "accepted",
        inviterMemberId: base.memberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now + 86_400_000,
        acceptedAt: now,
        createdAt: now,
        updatedAt: now,
      } as unknown as InvitationInsert);
      return { invitationId, organizationId: base.organizationId };
    });

    await t.mutation(m023Migration, migrationArgs);
    const snapshot = async () =>
      await t.run(async (ctx) => {
        const invitation = (await ctx.db.get(seeded.invitationId)) as unknown as MigrationInvitationView;
        return {
          invitation: {
            status: invitation.status,
            invitedName: invitation.invitedName,
            purpose: invitation.purpose,
            acceptedAt: invitation.acceptedAt,
            linkedAt: invitation.linkedAt,
            linkedByPersonId: invitation.linkedByPersonId,
          },
          conflicts: (await ctx.db.query("organizationMigrationConflicts").collect()).map((conflict) => conflict.code),
        };
      });
    const first = await snapshot();
    expect(first).toEqual({
      invitation: {
        status: "accepted",
        invitedName: "missing-evidence",
        purpose: "managerAddition",
        acceptedAt: 1_800_000_100_000,
        linkedAt: undefined,
        linkedByPersonId: undefined,
      },
      conflicts: ["invitation_linked_status_missing_evidence"],
    });

    await t.mutation(m023Migration, { ...migrationArgs, reset: true });
    expect(await snapshot()).toEqual(first);
  });

  it("別organizationとdanglingな人物を招待名やcanonical連携証跡へ転記しない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "invitation_m023_scope_owner",
        plan: "pro",
      });
      const other = await seedOrganizationManagerShop(ctx, {
        subject: "invitation_m023_scope_other",
        plan: "pro",
      });
      const now = 1_800_000_200_000;
      const danglingPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "削除済み連携者",
        email: "dangling-linker@example.com",
        emailNormalized: "dangling-linker@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.delete(danglingPersonId);
      const common = {
        organizationId: base.organizationId,
        inviterMemberId: base.memberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      };
      const crossOrganizationInvitationId = await ctx.db.insert("organizationInvitations", {
        ...common,
        email: "cross-scope@example.com",
        emailNormalized: "cross-scope@example.com",
        tokenDigest: "m023-cross-scope-digest",
        status: "accepted",
        targetPersonId: other.personId,
        acceptedAt: now,
        acceptedByPersonId: other.personId,
      } as unknown as InvitationInsert);
      const danglingLinkedInvitationId = await ctx.db.insert("organizationInvitations", {
        ...common,
        email: "dangling-linked@example.com",
        emailNormalized: "dangling-linked@example.com",
        invitedName: "既存の招待名",
        purpose: "managerAddition",
        tokenDigest: "m023-dangling-linked-digest",
        status: "linked",
        linkedAt: now,
        linkedByPersonId: danglingPersonId,
      } as unknown as InvitationInsert);
      return { crossOrganizationInvitationId, danglingLinkedInvitationId, danglingPersonId, now };
    });

    await t.mutation(m023Migration, migrationArgs);
    const snapshot = async () =>
      await t.run(async (ctx) => {
        const crossOrganization = (await ctx.db.get(
          seeded.crossOrganizationInvitationId,
        )) as unknown as MigrationInvitationView;
        const danglingLinked = (await ctx.db.get(
          seeded.danglingLinkedInvitationId,
        )) as unknown as MigrationInvitationView;
        return {
          crossOrganization: {
            invitedName: crossOrganization.invitedName,
            purpose: crossOrganization.purpose,
            status: crossOrganization.status,
            acceptedAt: crossOrganization.acceptedAt,
            acceptedByPersonId: crossOrganization.acceptedByPersonId,
            linkedAt: crossOrganization.linkedAt,
            linkedByPersonId: crossOrganization.linkedByPersonId,
          },
          danglingLinked: {
            status: danglingLinked.status,
            linkedAt: danglingLinked.linkedAt,
            linkedByPersonId: danglingLinked.linkedByPersonId,
          },
          conflicts: (await ctx.db.query("organizationMigrationConflicts").collect())
            .map((conflict) => conflict.code)
            .sort(),
        };
      });
    const first = await snapshot();
    expect(first).toEqual({
      crossOrganization: {
        invitedName: "cross-scope",
        purpose: "managerAddition",
        status: "accepted",
        acceptedAt: seeded.now,
        acceptedByPersonId: expect.any(String),
        linkedAt: undefined,
        linkedByPersonId: undefined,
      },
      danglingLinked: {
        status: "linked",
        linkedAt: seeded.now,
        linkedByPersonId: seeded.danglingPersonId,
      },
      conflicts: [
        "invitation_accepted_by_person_organization_mismatch",
        "invitation_linked_by_person_dangling",
        "invitation_target_person_organization_mismatch",
      ],
    });

    await t.mutation(m023Migration, { ...migrationArgs, reset: true });
    expect(await snapshot()).toEqual(first);
  });
});

async function readMigrationSnapshot(
  t: ReturnType<typeof createMigrationHistoryTestWithMigrations>,
  organizationId: Id<"organizations">,
  invitationIds: {
    accepted: Id<"organizationInvitations">;
    linked: Id<"organizationInvitations">;
    pending: Id<"organizationInvitations">;
  },
) {
  return await t.run(async (ctx) => {
    const readInvitation = async (invitationId: Id<"organizationInvitations">) => {
      const invitation = await ctx.db.get(invitationId);
      if (!invitation) throw new Error("organization invitation not found");
      const view = invitation as unknown as MigrationInvitationView;
      return {
        acceptedAt: view.acceptedAt,
        acceptedByPersonId: view.acceptedByPersonId,
        invitedName: view.invitedName,
        linkedAt: view.linkedAt,
        linkedByPersonId: view.linkedByPersonId,
        purpose: view.purpose,
        status: view.status,
      };
    };

    const invitations = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();
    const people = await ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    return {
      invitations: {
        accepted: await readInvitation(invitationIds.accepted),
        linked: await readInvitation(invitationIds.linked),
        pending: await readInvitation(invitationIds.pending),
      },
      invitationCount: invitations.length,
      peopleCount: people.length,
      audits: await ctx.db.query("organizationAuditEvents").collect(),
      conflicts: (await ctx.db.query("organizationMigrationConflicts").collect())
        .map((conflict) => conflict.code)
        .sort(),
    };
  });
}
