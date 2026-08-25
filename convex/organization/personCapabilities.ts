import type { OrganizationBillingPolicy } from "../organizationBilling/policy";

export type ManagerRole = "active" | "readOnly" | "none";

export const MANAGER_PERSON_REMOVAL_DISABLED_REASON = "先に管理者権限を外してください。";

type OrganizationPersonCapabilityInput = {
  managerRole: ManagerRole;
  activeManagerCount: number;
  canWriteNormally: boolean;
  canRecoverUsageLimits?: boolean;
  policy: OrganizationBillingPolicy | null;
  isActiveActor: boolean;
  isRestricted: boolean;
  isRestrictedRecovery: boolean;
  isLastRecoveryManager: boolean;
};

export function deriveOrganizationPersonCapabilities(input: OrganizationPersonCapabilityInput) {
  const isLastActiveManager = input.managerRole === "active" && input.activeManagerCount <= 1;
  const isManager = input.managerRole === "active" || input.managerRole === "readOnly";
  const canRemove =
    (input.canWriteNormally || input.canRecoverUsageLimits || input.isRestrictedRecovery) &&
    !isManager &&
    !isLastActiveManager &&
    !input.isLastRecoveryManager;
  const canRemoveManagerRole = Boolean(
    input.managerRole === "active" &&
      input.activeManagerCount > 1 &&
      (input.canWriteNormally || input.canRecoverUsageLimits) &&
      input.policy?.canManageManagers,
  );
  const managerRoleRemovalDisabledReason =
    input.managerRole === "none" || canRemoveManagerRole
      ? undefined
      : input.managerRole === "readOnly"
        ? "契約状態を復旧してから変更できます。"
        : input.activeManagerCount <= 1
          ? "最後の管理者の権限は外せません。"
          : !input.isActiveActor
            ? "現在のアカウント状態では、管理者権限を変更できません。"
            : input.isRestricted
              ? "現在の契約状態では、管理者権限を外せません。"
              : input.policy?.paidFeatureBlockReason === "paymentResultPending"
                ? "支払い結果が確定するまで、管理者権限を変更できません。"
                : "現在の契約状態では、管理者権限を変更できません。";
  const removeDisabledReason = canRemove
    ? undefined
    : isManager
      ? MANAGER_PERSON_REMOVAL_DISABLED_REASON
      : input.isLastRecoveryManager
        ? "現在の契約状態では、このユーザーを削除できません。"
        : isLastActiveManager
          ? "管理者は削除できません。"
          : input.isRestrictedRecovery
            ? "現在の契約状態では、このユーザーを削除できません。"
            : !input.isActiveActor
              ? "現在のアカウント状態では、ユーザーを削除できません。"
              : "現在の契約状態では、ユーザーを削除できません。";

  return {
    canRemoveManagerRole,
    managerRoleRemovalDisabledReason,
    canRemove,
    removeDisabledReason,
  };
}
