import type { ChartDatum } from "@/components/TrendChart";
import type { AnalyticsMetadata, DataCompleteness } from "./DataStatus";
import type { HealthSignalKey, MilestoneItem } from "./Presentation";

export type KpiViewModel = {
  key: string;
  label: string;
  value: string;
  detail: string;
  delta: number | null;
  deltaSuffix?: string;
  comparable: boolean;
  comparisonEnabled?: boolean;
  completeness: DataCompleteness;
  accent?: "teal" | "blue" | "green" | "orange" | "gray";
};

export type HealthViewModel = {
  key: HealthSignalKey;
  count?: number;
  delta?: number | null;
  startedAt?: string | number | null;
};

export type OrganizationRowViewModel = {
  organizationId: string;
  displayName: string;
  plan: string;
  shopCount: number | null;
  activeShopCount: number | null;
  uniquePersonCount: number | null;
  staffMembershipCount: number | null;
  unlinkedStaffCount: number | null;
  shiftTargetCount: number | null;
  managerCount: number | null;
  managerStaffCount: number | null;
  northStarRate: number | null;
  healthSignals: HealthViewModel[];
  healthCompleteness: DataCompleteness;
  completeness: DataCompleteness;
};

export type ShopRowViewModel = {
  shopId: string;
  organizationId: string;
  displayName: string;
  organizationName: string;
  plan: string;
  registeredAt: string | number | null;
  milestoneLabel: string;
  activeStaffCount: number | null;
  unlinkedStaffCount: number | null;
  shiftTargetCount: number | null;
  uniquePersonCount: number | null;
  managerCount: number | null;
  managerStaffCount: number | null;
  estimatedCadenceDays: number | null;
  nextCycleDate?: string | null;
  deadlineSubmissionRate: number | null;
  finalSubmissionRate: number | null;
  lineLinkedRate: number | null;
  healthSignals: HealthViewModel[];
  healthCompleteness: DataCompleteness;
  latestActivityAt: string | number | null;
  completeness: DataCompleteness;
};

export type CycleRowViewModel = {
  recruitmentId: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string | number;
  submitDeadlineAt: string | number | null;
  confirmedAt: string | number | null;
  closedAt: string | number | null;
  submittedAtDeadline: number | null;
  targetAtDeadline: number | null;
  deadlineSubmissionRate: number | null;
  submittedAtClose: number | null;
  targetAtClose: number | null;
  finalSubmissionRate: number | null;
  notificationSentCount: number | null;
  notificationFailedCount: number | null;
  reminderSentCount: number | null;
  completeness: DataCompleteness;
};

export type SegmentRowViewModel = {
  dimension: string;
  bucket: string;
  shopCount: number;
  secondConfirmedCount: number;
  northStarRate: number | null;
  deadlineSubmissionRate: number | null;
  finalSubmissionRate: number | null;
  healthSignals: HealthViewModel[];
  healthCompleteness: DataCompleteness;
  completeness: DataCompleteness;
};

export type OverviewViewModel = {
  metadata: AnalyticsMetadata;
  kpis: KpiViewModel[];
  trend: ChartDatum[];
  trendKeys: string[];
  milestones: MilestoneItem[];
  healthSignals: HealthViewModel[];
  healthCompleteness: DataCompleteness;
  attentionShops: ShopRowViewModel[];
  segments: SegmentRowViewModel[];
};

export type OrganizationDetailViewModel = {
  metadata: AnalyticsMetadata;
  organizationId: string;
  displayName: string;
  plan: string;
  registeredAt: string | number | null;
  shopCount: number | null;
  kpis: KpiViewModel[];
  expansionKpis: KpiViewModel[];
  healthSignals: HealthViewModel[];
  healthCompleteness: DataCompleteness;
  trend: ChartDatum[];
  trendKeys: string[];
  shops: ShopRowViewModel[];
};

export type ShopDetailViewModel = {
  metadata: AnalyticsMetadata;
  shopId: string;
  displayName: string;
  organizationId: string;
  organizationName: string;
  plan: string;
  registeredAt: string | number | null;
  cycleCount: number | null;
  nextCycleDate: string | null;
  kpis: KpiViewModel[];
  cumulativeKpis: KpiViewModel[];
  periodRateKpis: KpiViewModel[];
  periodRateTargetCount: number | null;
  rateRange: { from: string; to: string } | null;
  snapshotDate: string | null;
  milestones: MilestoneItem[];
  healthSignals: HealthViewModel[];
  healthCompleteness: DataCompleteness;
  trend: ChartDatum[];
  trendKeys: string[];
  cycles: CycleRowViewModel[];
};

export type CycleDetailViewModel = CycleRowViewModel & {
  metadata: AnalyticsMetadata;
  shopId: string;
  shopName: string;
  organizationId: string;
  organizationName: string;
  sequenceNumber: number | null;
  creationLeadTimeMs: number | null;
  confirmationLeadTimeMs: number | null;
  confirmedBeforeStart: boolean | null;
};
