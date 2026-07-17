import type { Doc } from "../_generated/dataModel";

export type OrganizationInvitationPurpose = "managerAddition" | "freeManagerExchange";

export function getOrganizationInvitationPurpose(
  invitation: Pick<Doc<"organizationInvitations">, "purpose">,
): OrganizationInvitationPurpose {
  // TODO[narrow]: 対象はNarrow着手時に追加するorganizationInvitations purpose補完migration。
  //   Widen前の招待を失効または補完し、develop/prodの未設定件数が0件であることを
  //   `pnpm convex:migrate:status` と管理用集計で確認後、schemaのpurposeを必須化してこのfallbackを削除する。
  return invitation.purpose ?? "managerAddition";
}
