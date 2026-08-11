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

export type CurrentSubscriptionPrice = {
  currency: string;
  unitAmount: number;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
  taxBehavior?: "inclusive" | "exclusive";
};

export type CurrentSubscriptionPriceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "available"; value: CurrentSubscriptionPrice }
  | { status: "unavailable"; reason: string }
  | { status: "error" };

export type PlanPriceDisplayState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "available"; label: string }
  | { status: "unavailable"; message: string; canRetry: boolean }
  | { status: "error"; message: string };

export type PlanStatusCardData =
  | {
      kind: "paidPlan";
      planName: PaidPlanName;
      badgeLabel: "利用中" | "支払い不要" | "変更予定";
      description?: string;
      nextEventLabel?: string;
      price: PlanPriceDisplayState | null;
      primaryActionLabel: string;
    }
  | {
      kind: "freePlan";
      description: string;
      primaryAction: "choosePlan" | "openPlanAndPayment";
      primaryActionLabel: string;
    }
  | {
      kind: "trial";
      remainingDays: number;
      trialEndsOnLabel: string;
      continuationPlanName?: PaidPlanName;
      description: string;
      primaryAction: "choosePlan" | "openPlanAndPayment";
      primaryActionLabel: string;
      showRemindLater: boolean;
    }
  | {
      kind: "paymentPending";
      currentPlanName?: PlanName;
      targetPlanName: PaidPlanName;
      description: string;
      primaryActionLabel: string;
    }
  | {
      kind: "paymentIssue";
      planName?: PaidPlanName;
      phase: "grace" | "restricted";
      description: string;
      recoveryDeadlineLabel?: string;
      primaryAction: "updatePaymentMethod" | "viewPaymentIssueDetails";
      primaryActionLabel: string;
      showDetailsAction: boolean;
    }
  | {
      kind: "restricted";
      planName?: PlanName;
      description: string;
      primaryActionLabel: string;
    };

export type PlanStatusCardAction =
  | "openPlanAndPayment"
  | "choosePlan"
  | "remindLater"
  | "updatePaymentMethod"
  | "viewPaymentIssueDetails"
  | "retryCurrentPrice";

export type PlanStatusCardUsageItem = {
  current: number;
  max: number;
};

export type PlanStatusCardUsage = {
  peopleUsage: PlanStatusCardUsageItem;
  shopUsage: PlanStatusCardUsageItem;
  managerUsage?: PlanStatusCardUsageItem;
};

export type PlanStatusCardProps = {
  data: PlanStatusCardData;
  usage?: PlanStatusCardUsage | null;
  defaultExpanded?: boolean;
  onAction: (action: PlanStatusCardAction) => void;
  onExpandedChange?: (expanded: boolean) => void;
};
