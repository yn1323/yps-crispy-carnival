import { migrations } from "./index";

/**
 * Widen migration for the authorization-issued -> account-linked lifecycle.
 * TODO[narrow]: After completion in every deployment, remove legacy
 * pending/accepted statuses and accepted* fields from the schema and readers.
 */
export const migration = migrations.define({
  table: "organizationInvitations",
  batchSize: 50,
  migrateOne: async (ctx, invitation) => {
    const targetPerson = invitation.targetPersonId ? await ctx.db.get(invitation.targetPersonId) : null;
    const invitedName = invitation.invitedName ?? targetPerson?.name ?? invitation.email.split("@", 1)[0];

    if (invitation.status === "pending") {
      return { status: "issued" as const, invitedName };
    }
    if (invitation.status === "accepted") {
      return {
        status: "linked" as const,
        invitedName,
        ...(invitation.acceptedAt !== undefined ? { linkedAt: invitation.acceptedAt } : {}),
        ...(invitation.acceptedByPersonId !== undefined ? { linkedByPersonId: invitation.acceptedByPersonId } : {}),
      };
    }
    if (invitation.status === "linked") {
      return {
        invitedName,
        ...(invitation.linkedAt === undefined && invitation.acceptedAt !== undefined
          ? { linkedAt: invitation.acceptedAt }
          : {}),
        ...(invitation.linkedByPersonId === undefined && invitation.acceptedByPersonId !== undefined
          ? { linkedByPersonId: invitation.acceptedByPersonId }
          : {}),
      };
    }
    if (invitation.invitedName === undefined) return { invitedName };
  },
});
