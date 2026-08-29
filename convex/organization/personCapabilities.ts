import type { OrganizationBillingPolicy } from "../organizationBilling/policy";

export type ManagerRole = "active" | "none";

export const MANAGER_PERSON_REMOVAL_DISABLED_REASON = "先に管理者権限を外してください。";

type OrganizationPersonCapabilityInput = {
  managerRole: ManagerRole;
  activeManagerCount: number;
  canWriteNormally: boolean;
  canRecoverUsageLimits?: boolean;
  policy: OrganizationBillingPolicy | null;
  isActiveActor: boolean;
};

export function deriveOrganizationPersonCapabilities(input: OrganizationPersonCapabilityInput) {
  const isLastActiveManager = input.managerRole === "active" && input.activeManagerCount <= 1;
  const isManager = input.managerRole === "active";
  const canRemove = Boolean(
    (input.canWriteNormally || input.canRecoverUsageLimits) && !isManager && !isLastActiveManager,
  );
  const canRemoveManagerRole = Boolean(
    input.managerRole === "active" &&
      input.activeManagerCount > 1 &&
      (input.canWriteNormally || input.canRecoverUsageLimits) &&
      input.policy?.canManageManagers,
  );
  const managerRoleRemovalDisabledReason =
    input.managerRole === "none" || canRemoveManagerRole
      ? undefined
      : input.activeManagerCount <= 1
        ? "少なくとも管理者が1名必要です。"
        : !input.isActiveActor
          ? "現在のアカウント状態では、管理者権限を変更できません。"
          : input.policy?.paidFeatureBlockReason === "paymentResultPending"
            ? "支払い結果が確定するまで、管理者権限を変更できません。"
            : "現在の契約状態では、管理者権限を変更できません。";
  const removeDisabledReason = canRemove
    ? undefined
    : isManager
      ? MANAGER_PERSON_REMOVAL_DISABLED_REASON
      : isLastActiveManager
        ? "管理権限を外してから削除してください。"
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
