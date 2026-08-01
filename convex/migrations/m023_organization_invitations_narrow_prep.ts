import type { Id } from "../_generated/dataModel";
import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

type InvitationPurpose = "managerAddition" | "freeManagerExchange";
type LegacyInvitationStatus = "pending" | "accepted" | "issued" | "linked" | "revoked" | "expired";

type LegacyInvitationView = {
  email: string;
  invitedName?: string;
  purpose?: InvitationPurpose;
  status: LegacyInvitationStatus;
  targetPersonId?: Id<"organizationPeople">;
  linkedAt?: number;
  linkedByPersonId?: Id<"organizationPeople">;
  acceptedAt?: number;
  acceptedByPersonId?: Id<"organizationPeople">;
};

type LegacyInvitationPatch = {
  invitedName?: string;
  purpose?: InvitationPurpose;
  status?: "issued" | "linked";
  linkedAt?: number;
  linkedByPersonId?: Id<"organizationPeople">;
  acceptedAt?: undefined;
  acceptedByPersonId?: undefined;
};

const CONFLICT_CODES = {
  acceptedFieldsOnUnlinkedStatus: "invitation_accepted_fields_on_unlinked_status",
  linkedAtMismatch: "invitation_linked_at_mismatch",
  linkedByPersonMismatch: "invitation_linked_by_person_mismatch",
  linkedStatusMissingEvidence: "invitation_linked_status_missing_evidence",
  targetPersonDangling: "invitation_target_person_dangling",
  targetPersonOrganizationMismatch: "invitation_target_person_organization_mismatch",
  linkedByPersonDangling: "invitation_linked_by_person_dangling",
  linkedByPersonOrganizationMismatch: "invitation_linked_by_person_organization_mismatch",
  acceptedByPersonDangling: "invitation_accepted_by_person_dangling",
  acceptedByPersonOrganizationMismatch: "invitation_accepted_by_person_organization_mismatch",
} as const;
const OWNED_CONFLICT_CODES = Object.values(CONFLICT_CODES);

/**
 * organizationInvitationsのNarrow前に、旧ライフサイクルと欠損fieldを正規化する。
 *
 * Production完了の証跡が揃うまではschemaとruntime fallbackを残す。Narrow後の履歴再生でも
 * 旧shapeを扱えるよう、migration内だけ旧fieldを明示した型ビューを使う。
 */
export const migration = migrations.define({
  table: "organizationInvitations",
  batchSize: 50,
  migrateOne: async (ctx, invitation) => {
    const legacy = invitation as unknown as LegacyInvitationView;
    const patch: LegacyInvitationPatch = {};
    const conflictCodes: string[] = [];

    const targetPerson = legacy.targetPersonId ? await ctx.db.get(legacy.targetPersonId) : null;
    const linkedByPerson = legacy.linkedByPersonId ? await ctx.db.get(legacy.linkedByPersonId) : null;
    const acceptedByPerson = legacy.acceptedByPersonId ? await ctx.db.get(legacy.acceptedByPersonId) : null;
    const targetPersonScopeValid =
      legacy.targetPersonId === undefined || targetPerson?.organizationId === invitation.organizationId;
    const linkedByPersonScopeValid =
      legacy.linkedByPersonId === undefined || linkedByPerson?.organizationId === invitation.organizationId;
    const acceptedByPersonScopeValid =
      legacy.acceptedByPersonId === undefined || acceptedByPerson?.organizationId === invitation.organizationId;

    if (legacy.targetPersonId && !targetPerson) conflictCodes.push(CONFLICT_CODES.targetPersonDangling);
    else if (targetPerson && targetPerson.organizationId !== invitation.organizationId) {
      conflictCodes.push(CONFLICT_CODES.targetPersonOrganizationMismatch);
    }
    if (legacy.linkedByPersonId && !linkedByPerson) conflictCodes.push(CONFLICT_CODES.linkedByPersonDangling);
    else if (linkedByPerson && linkedByPerson.organizationId !== invitation.organizationId) {
      conflictCodes.push(CONFLICT_CODES.linkedByPersonOrganizationMismatch);
    }
    if (legacy.acceptedByPersonId && !acceptedByPerson) conflictCodes.push(CONFLICT_CODES.acceptedByPersonDangling);
    else if (acceptedByPerson && acceptedByPerson.organizationId !== invitation.organizationId) {
      conflictCodes.push(CONFLICT_CODES.acceptedByPersonOrganizationMismatch);
    }

    if (legacy.invitedName === undefined) {
      patch.invitedName = targetPersonScopeValid && targetPerson ? targetPerson.name : legacy.email.split("@", 1)[0];
    }
    if (legacy.purpose === undefined) {
      patch.purpose = "managerAddition";
    }

    const acceptedEvidenceComplete =
      legacy.acceptedAt !== undefined &&
      legacy.acceptedByPersonId !== undefined &&
      acceptedByPersonScopeValid &&
      targetPersonScopeValid;
    const normalizedStatus =
      legacy.status === "pending"
        ? "issued"
        : legacy.status === "accepted" && acceptedEvidenceComplete
          ? "linked"
          : legacy.status;
    if (legacy.status === "pending") {
      patch.status = "issued";
    } else if (legacy.status === "accepted" && acceptedEvidenceComplete) {
      patch.status = "linked";
    }

    if (
      legacy.status !== "accepted" &&
      normalizedStatus !== "linked" &&
      (legacy.acceptedAt !== undefined || legacy.acceptedByPersonId !== undefined)
    ) {
      conflictCodes.push(CONFLICT_CODES.acceptedFieldsOnUnlinkedStatus);
    }
    if (legacy.linkedAt !== undefined && legacy.acceptedAt !== undefined && legacy.linkedAt !== legacy.acceptedAt) {
      conflictCodes.push(CONFLICT_CODES.linkedAtMismatch);
    }
    if (
      legacy.linkedByPersonId !== undefined &&
      legacy.acceptedByPersonId !== undefined &&
      legacy.linkedByPersonId !== legacy.acceptedByPersonId
    ) {
      conflictCodes.push(CONFLICT_CODES.linkedByPersonMismatch);
    }
    const effectiveLinkedAt = legacy.linkedAt ?? legacy.acceptedAt;
    const effectiveLinkedByPersonId = legacy.linkedByPersonId ?? legacy.acceptedByPersonId;
    if (
      (normalizedStatus === "linked" || legacy.status === "accepted") &&
      (effectiveLinkedAt === undefined || effectiveLinkedByPersonId === undefined)
    ) {
      conflictCodes.push(CONFLICT_CODES.linkedStatusMissingEvidence);
    }

    // linked済みの招待だけ旧連携情報を引き継ぐ。矛盾する監査値は捨てず、運用修復へ残す。
    if (
      normalizedStatus === "linked" &&
      targetPersonScopeValid &&
      linkedByPersonScopeValid &&
      acceptedByPersonScopeValid
    ) {
      if (legacy.linkedAt === undefined && legacy.acceptedAt !== undefined) {
        patch.linkedAt = legacy.acceptedAt;
      }
      if (
        legacy.linkedByPersonId === undefined &&
        legacy.acceptedByPersonId !== undefined &&
        acceptedByPerson?.organizationId === invitation.organizationId
      ) {
        patch.linkedByPersonId = legacy.acceptedByPersonId;
      }
    }

    await resolveOrganizationMigrationConflicts(ctx, {
      sourceType: "organization",
      sourceId: invitation._id,
      codes: OWNED_CONFLICT_CODES,
    });
    for (const code of conflictCodes) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId: invitation.organizationId,
        sourceType: "organization",
        sourceId: invitation._id,
        code,
      });
    }

    if (conflictCodes.length === 0) {
      if (legacy.acceptedAt !== undefined) patch.acceptedAt = undefined;
      if (legacy.acceptedByPersonId !== undefined) patch.acceptedByPersonId = undefined;
    }

    if (Object.keys(patch).length === 0) return;
    return patch as Partial<typeof invitation>;
  },
});
