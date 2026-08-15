import type { OrganizationBillingPolicy } from "../organizationBilling/policy";

export type ManagerRole = "active" | "readOnly" | "none";

export const MANAGER_PERSON_REMOVAL_DISABLED_REASON = "先に管理者権限を外してください。";

type OrganizationPersonCapabilityInput = {
  managerRole: ManagerRole;
  activeManagerCount: number;
  canWriteNormally: boolean;
  policy: OrganizationBillingPolicy | null;
  isStaff: boolean;
  isBillingContact: boolean;
  isActiveActor: boolean;
  isRestricted: boolean;
  isRestrictedRecovery: boolean;
  isLastRecoveryManager: boolean;
};

export function deriveOrganizationPersonCapabilities(input: OrganizationPersonCapabilityInput) {
  const isLastActiveManager = input.managerRole === "active" && input.activeManagerCount <= 1;
  const isManager = input.managerRole === "active" || input.managerRole === "readOnly";
  const canRemove =
    (input.canWriteNormally || input.isRestrictedRecovery) &&
    !isManager &&
    !isLastActiveManager &&
    !input.isLastRecoveryManager &&
    !input.isBillingContact;
  const canRemoveManagerRole = Boolean(
    input.managerRole === "active" &&
      input.activeManagerCount > 1 &&
      input.canWriteNormally &&
      input.policy?.canManageManagers &&
      (input.isStaff || !input.isBillingContact),
  );
  const managerRoleRemovalDisabledReason =
    input.managerRole === "none" || canRemoveManagerRole
      ? undefined
      : input.managerRole === "readOnly"
        ? "契約状態を復旧してから変更できます。"
        : input.activeManagerCount <= 1
          ? "最後の管理者の権限は外せません。"
          : !input.isActiveActor
            ? "閲覧のみの管理者は、管理者権限を変更できません。"
            : input.isRestricted
              ? "契約制限中は、管理者権限を外せません。"
              : input.policy?.paidFeatureBlockReason === "paymentResultPending"
                ? "支払い結果が確定するまで、管理者権限を変更できません。"
                : !input.isStaff && input.isBillingContact
                  ? "管理者権限を外すには、先に請求先メールアドレスを変更してください。"
                  : "現在の契約状態では、管理者権限を変更できません。";
  const removeDisabledReason = canRemove
    ? undefined
    : isManager
      ? MANAGER_PERSON_REMOVAL_DISABLED_REASON
      : input.isLastRecoveryManager
        ? "最後の復旧担当者は、引き継ぎまたは契約の復旧が完了するまで削除できません。"
        : isLastActiveManager
          ? "管理者は削除できません。"
          : input.isBillingContact
            ? "削除するには、先に請求先メールアドレスを変更してください。"
            : input.isRestrictedRecovery
              ? "現在の契約状態では、このユーザーを削除できません。"
              : !input.isActiveActor
                ? "閲覧のみの管理者は、ユーザーを削除できません。"
                : "現在の契約状態では、ユーザーを削除できません。";

  return {
    canRemoveManagerRole,
    managerRoleRemovalDisabledReason,
    canRemove,
    removeDisabledReason,
  };
}
