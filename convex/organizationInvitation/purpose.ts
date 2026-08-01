import type { Doc } from "../_generated/dataModel";

export type OrganizationInvitationPurpose = "managerAddition" | "freeManagerExchange";

export function getOrganizationInvitationPurpose(
  invitation: Pick<Doc<"organizationInvitations">, "purpose">,
): OrganizationInvitationPurpose {
  // TODO[narrow]: 全deploymentでm023が完走し、verifyOrganizationInvitationsの全pageでmissingPurposeが
  //   0件であることを確認後、schemaのpurposeを必須化してこのfallbackを削除する。
  return invitation.purpose ?? "managerAddition";
}
