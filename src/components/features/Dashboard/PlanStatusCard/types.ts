export type PaidPlanName = "Pro" | "Business";
export type PlanName = "Free" | PaidPlanName;

export type DashboardPlanStatusSource =
  | {
      kind: "trial";
      trialEndsAt: number;
      selectedPaidPlan?: "pro" | "business";
      canManagePlan: boolean;
      canUpdatePaymentMethod: boolean;
    }
  | {
      kind: "freePlan";
      canManagePlan: boolean;
      canUpdatePaymentMethod: boolean;
    }
  | {
      kind: "paidPlan";
      plan: "pro" | "business";
      isComplimentary: boolean;
      currentPeriodEndsAt?: number;
      scheduledChange?: {
        targetPlan: "free" | "pro";
        effectiveAt: number;
        restrictAtPeriodEnd?: true;
      };
      canManagePlan: boolean;
      canUpdatePaymentMethod: boolean;
    }
  | {
      kind: "paymentIssue";
      plan?: "pro" | "business";
      phase: "grace" | "restricted";
      recoveryDeadlineAt?: number;
      canManagePlan: boolean;
      canUpdatePaymentMethod: boolean;
    }
  | {
      kind: "paymentPending";
      currentPlan: "free" | "pro" | null;
      targetPlan: "pro" | "business";
      canManagePlan: boolean;
      canUpdatePaymentMethod: boolean;
    }
  | {
      kind: "restricted";
      displayPlan: "free" | "pro" | "business" | null;
      canManagePlan: boolean;
      canUpdatePaymentMethod: boolean;
    };

export type PlanStatusCardData =
  | {
      kind: "paidPlan";
      planName: PaidPlanName;
      badgeLabel: "利用中" | "支払い不要" | "変更予定" | "解約予定";
      description?: string;
      nextEventLabel?: string;
    }
  | {
      kind: "freePlan";
      description: string;
      primaryAction?: {
        action: "choosePlan";
        label: string;
      };
    }
  | {
      kind: "trial";
      remainingDays: number;
      trialEndsOnLabel: string;
      continuationPlanName?: PaidPlanName;
      description: string;
      primaryAction?: {
        action: "choosePlan";
        label: string;
      };
      showRemindLater: boolean;
    }
  | {
      kind: "paymentPending";
      currentPlanName?: PlanName;
      targetPlanName: PaidPlanName;
      description: string;
    }
  | {
      kind: "paymentIssue";
      planName?: PaidPlanName;
      phase: "grace" | "restricted";
      description: string;
      recoveryDeadlineLabel?: string;
      primaryAction?: {
        action: "updatePaymentMethod" | "choosePlan";
        label: string;
      };
    }
  | {
      kind: "restricted";
      planName?: PlanName;
      description: string;
    };

export type PlanStatusCardAction = "openPlanAndPayment" | "choosePlan" | "remindLater" | "updatePaymentMethod";

export type PlanStatusCardUsageItem = {
  current: number;
  max: number;
};

export type PlanStatusCardUsage = {
  peopleUsage: PlanStatusCardUsageItem;
  shopUsage: PlanStatusCardUsageItem;
  managerUsage?: PlanStatusCardUsageItem;
  pendingManagerInvitations?: number;
};

export type PlanStatusCardProps = {
  data: PlanStatusCardData;
  usage?: PlanStatusCardUsage | null;
  defaultExpanded?: boolean;
  onAction: (action: PlanStatusCardAction) => void;
  onExpandedChange?: (expanded: boolean) => void;
};
