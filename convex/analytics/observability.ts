const SAFE_ERROR_CODES = new Set([
  "analytics_active_membership_duplicate",
  "analytics_audit_event_key_invalid",
  "analytics_confirmation_lead_time_invalid",
  "analytics_cycle_membership_overlap",
  "analytics_cycle_membership_scope_invalid",
  "analytics_cycle_opportunity_duplicate",
  "analytics_cycle_opportunity_union_too_large",
  "analytics_cycle_partial_not_supported",
  "analytics_daily_organization_duplicate",
  "analytics_daily_organization_incomplete",
  "analytics_daily_output_run_conflict",
  "analytics_daily_run_required",
  "analytics_daily_segment_duplicate",
  "analytics_daily_service_already_initialized",
  "analytics_daily_service_duplicate",
  "analytics_daily_service_missing",
  "analytics_daily_shop_duplicate",
  "analytics_daily_shop_eligibility_missing",
  "analytics_daily_shop_incomplete",
  "analytics_eligible_shop_incomplete",
  "analytics_event_cycle_scope_missing",
  "analytics_event_manager_scope_missing",
  "analytics_event_organization_id_missing",
  "analytics_event_person_scope_missing",
  "analytics_event_plan_scope_missing",
  "analytics_event_shop_scope_missing",
  "analytics_event_staff_scope_missing",
  "analytics_event_submission_scope_missing",
  "analytics_invariant_accumulator_invalid",
  "analytics_invariant_accumulator_missing",
  "analytics_line_account_batch_too_large",
  "analytics_line_batch_incomplete",
  "analytics_maintenance_preempted",
  "analytics_manager_exchange_same_person",
  "analytics_notification_cycle_scope_mismatch",
  "analytics_notification_scope_conflict",
  "analytics_notification_terminal_at_missing",
  "analytics_opportunity_redaction_incomplete",
  "analytics_organization_daily_shop_scope_too_large",
  "analytics_organization_future_fact",
  "analytics_organization_manager_scope_too_large",
  "analytics_organization_people_scope_too_large",
  "analytics_organization_shop_scope_too_large",
  "analytics_organization_shop_snapshot_mismatch",
  "analytics_organization_staff_scope_too_large",
  "analytics_plan_shop_delta_scope_missing",
  "analytics_plan_status_delta_batch_too_large",
  "analytics_projection_cycle_scope_invalid",
  "analytics_projection_cycle_shop_missing",
  "analytics_projection_continuation_invalid",
  "analytics_projection_continuation_required",
  "analytics_projection_person_organization_mismatch",
  "analytics_projection_plan_organization_missing",
  "analytics_projection_shop_organization_mismatch",
  "analytics_projection_shop_organization_missing",
  "analytics_projection_staff_shop_scope_invalid",
  "analytics_projection_submission_shop_missing",
  "analytics_projection_source_event_invalid",
  "analytics_rate_pair_invalid",
  "analytics_reset_guard_rejected",
  "analytics_reset_scope_invalid",
  "analytics_run_create_failed",
  "analytics_run_fence_rejected",
  "analytics_run_invariant_failed",
  "analytics_scope_limit_exceeded",
  "analytics_segment_dimension_missing",
  "analytics_service_organization_scope_too_large",
  "analytics_service_organization_snapshot_mismatch",
  "analytics_shop_cycle_scope_mismatch",
  "analytics_shop_cycle_scope_too_large",
  "analytics_shop_future_activity",
  "analytics_shop_future_fact",
  "analytics_shop_membership_scope_mismatch",
  "analytics_shop_notification_scope_too_large",
  "analytics_shop_staff_scope_too_large",
  "analytics_shop_upcoming_cycle_scope_too_large",
  "analytics_single_scope_page_overflow",
  "analytics_source_event_key_conflict",
  "analytics_source_event_scope_invalid",
  "analytics_source_event_type_mismatch",
  "analytics_source_page_overflow",
  "analytics_staff_membership_batch_too_large",
]);

export type AnalyticsLogEvent =
  | {
      event: "analytics_run_started" | "analytics_run_complete";
      kind: "daily" | "reset" | "maintenance";
      runId: string;
      targetDate?: string;
      stage: string;
      step: number;
      durationMs?: number;
    }
  | {
      event: "analytics_maintenance_complete";
      kind: "maintenance";
      runId: string;
      stage: string;
      step: number;
      durationMs?: number;
      oldestUnredactedExpiresAt?: number;
    }
  | {
      event: "analytics_run_failed";
      kind: "daily" | "reset" | "maintenance";
      runId: string;
      targetDate?: string;
      stage: string;
      step: number;
      errorCode: string;
    };

export function analyticsRunDigest(runId: string): string {
  return runId.slice(-12);
}

export function safeAnalyticsErrorCode(error: unknown): string {
  if (error instanceof Error) {
    const codes = error.message.match(/analytics_[a-z0-9_]+/g) ?? [];
    const safeCode = codes.find((code) => SAFE_ERROR_CODES.has(code));
    if (safeCode) return safeCode;
  }
  return "analytics_unexpected";
}

// 呼出し側がsource payloadや任意messageを渡せない固定shapeにする。
export function formatAnalyticsLog(event: AnalyticsLogEvent): string {
  return JSON.stringify({ ...event, runId: analyticsRunDigest(event.runId) });
}
