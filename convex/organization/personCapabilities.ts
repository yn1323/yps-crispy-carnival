import type { OrganizationBillingPolicy } from "../organizationBilling/policy";

export type ManagerRole = "active" | "readOnly" | "none";

type OrganizationPersonCapabilityInput = {
  managerRole: ManagerRole;
  activeManagerCount: number;
  canWriteNormally: boolean;
  policy: OrganizationBillingPolicy | null;
  isStaff: boolean;
  isBillingContact: boolean;
  hasFutureAssignment: boolean;
  isActiveActor: boolean;
  isRestricted: boolean;
  isRestrictedRecovery: boolean;
  isLastRecoveryManager: boolean;
};

export function deriveOrganizationPersonCapabilities(input: OrganizationPersonCapabilityInput) {
  const isLastActiveManager = input.managerRole === "active" && input.activeManagerCount <= 1;
  const canRemove =
    (input.canWriteNormally || input.isRestrictedRecovery) &&
    !isLastActiveManager &&
    !input.isLastRecoveryManager &&
    !input.isBillingContact &&
    !input.hasFutureAssignment;
  const canRemoveManagerRole = Boolean(
    input.managerRole === "active" &&
      input.activeManagerCount > 1 &&
      input.canWriteNormally &&
      input.policy?.canUsePaidFeatures &&
      (input.isStaff || (!input.isBillingContact && !input.hasFutureAssignment)),
  );
  const managerRoleRemovalDisabledReason =
    input.managerRole !== "active" || canRemoveManagerRole
      ? undefined
      : input.activeManagerCount <= 1
        ? "最後の有効管理者の管理者権限は外せません。"
        : !input.isActiveActor
          ? "閲覧のみの管理者は管理者権限を変更できません。"
          : input.isRestricted
            ? "契約制限中は管理者権限を外せません。"
            : input.policy?.paidFeatureBlockReason === "freePlan"
              ? "Freeでは管理者の個別解除はできません。"
              : input.policy?.paidFeatureBlockReason === "paymentResultPending"
                ? "支払い結果が確定してから管理者権限を変更できます。"
                : !input.isStaff && input.isBillingContact
                  ? "請求先メールアドレスを変更してから管理者権限を外してください。"
                  : !input.isStaff && input.hasFutureAssignment
                    ? "将来のシフト割当を解除してから管理者権限を外してください。"
                    : "現在の契約状態では管理者権限を変更できません。";
  const removeDisabledReason = canRemove
    ? undefined
    : input.isLastRecoveryManager
      ? "最後の復旧担当者は、引き継ぎまたは契約復旧まで削除できません。"
      : isLastActiveManager
        ? "最後の有効管理者は削除できません。"
        : input.isBillingContact
          ? "請求先メールアドレスを変更してから削除してください。"
          : input.hasFutureAssignment
            ? "将来のシフト割当を解除してから削除してください。"
            : input.isRestrictedRecovery
              ? "現在の契約状態ではこのユーザーを削除できません。"
              : !input.isActiveActor
                ? "閲覧のみの管理者はユーザーを削除できません。"
                : "現在の契約状態ではユーザーを削除できません。";

  return {
    canRemoveManagerRole,
    managerRoleRemovalDisabledReason,
    canRemove,
    removeDisabledReason,
  };
}
