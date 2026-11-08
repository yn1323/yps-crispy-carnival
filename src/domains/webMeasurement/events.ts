import type { Metric } from "web-vitals";
import type { OrganizationPlan } from "../shop/context";
import type { StaffAccessKind } from "../staffAccess";
import {
  getWebMeasurementRouteArea,
  type WebMeasurementRouteArea,
  type WebMeasurementRouteFamily,
} from "./routePolicy";

export const webMeasurementEnvironments = ["local", "develop", "preview", "production"] as const;
export type WebMeasurementEnvironment = (typeof webMeasurementEnvironments)[number];

export const publicCtaIds = [
  "header_login",
  "header_signup",
  "hero_signup",
  "hero_help",
  "flow_signup",
  "pricing_signup",
  "bottom_signup",
  "bottom_help",
  "article_cta",
  "feature_hero_signup",
  "feature_bottom_signup",
] as const;
export type PublicCtaId = (typeof publicCtaIds)[number];

export type ViewportClass = "mobile" | "desktop";

export type SetupKind = "first" | "additional";
export type SubmissionPatternKind = "time" | "dateOnly" | "shiftType";
export type MeasuredPageSection = "pricing";
export type ShiftExportFormat = "pdf" | "xlsx";
export type CheckoutPlan = "standard" | "pro";
export const securityCheckIssueReasons = [
  "stalled",
  "error",
  "unsupported",
  "interactive_timeout",
  "script_load_failed",
] as const;
export type SecurityCheckIssueReason = (typeof securityCheckIssueReasons)[number];

export type DisplayMode = "standalone" | "browser";
export type AuthMethod = "google" | "email";
export type DemoStage = "tour_start" | "tour_close" | "confirm";
export type OnboardingStage = "create_recruitment" | "submit_self" | "review_submission" | "add_staff";
export type PromotionCodeResult = "valid" | "invalid";
export type StaffAddMethod = "manual" | "existing_person" | "request_approve";
export type ShareMethod = "copy";
export type ShareContentType = "staff_registration_link";
export type ShiftConfirmIntent = "confirm" | "resend";
export type CheckoutResult = "returned" | "cancelled";
export type TrialNoticeStage = "early" | "soon" | "last_day";
export type HomeScreenGuideAction = "view" | "open" | "dismiss";
export type DaysBucket = "overdue" | "0" | "1" | "2_3" | "4_7" | "8_14" | "15_plus";
export const staffLinkInvalidReasons = [
  "no_token",
  "unknown_link",
  "rejected",
  "session_rejected",
  "recruitment_deleted",
  "submission_closed",
  "usage_limit_exceeded",
  "usage_limit_evaluation_unavailable",
  "rate_limited",
] as const;
export type StaffLinkInvalidReason = (typeof staffLinkInvalidReasons)[number];
export const appErrorSurfaces = ["toast", "screen", "section", "dialog"] as const;
export type AppErrorSurface = (typeof appErrorSurfaces)[number];
export const appErrorSources = [
  "server_business",
  "server_unexpected",
  "network",
  "chunk_load",
  "render",
  "client",
] as const;
export type AppErrorSource = (typeof appErrorSources)[number];
export type AppTimingPhase = "clerk_loaded" | "user_loaded" | "app_ready";

/** 管理画面の成功した操作。キーイベントにしない操作は、GTMタグと定義を増やさないよう一つのイベントにまとめる。 */
export const manageActionsByTarget = {
  recruitment: ["update", "delete"],
  shift: ["save"],
  staff: [
    "reject_request",
    "exclude",
    "include",
    "remove",
    "reorder",
    "change_shops",
    "update_profile",
    "rotate_link",
    "line_link_issue",
    "line_invite",
    "line_disconnect",
    "notify_recruitment",
    "notify_shift",
  ],
  notification: ["resend", "resend_all", "resolve"],
  manager: ["invite", "resend_invite", "revoke_invite", "remove_role", "accept_invite"],
  organization: ["add_shop", "delete_shop", "delete_organization", "rename", "update_shop", "update_billing_email"],
  billing: [
    "change_plan_now",
    "schedule_plan_change",
    "cancel_plan_change",
    "schedule_stop",
    "cancel_trial_continuation",
    "open_portal",
    "cancel_checkout",
  ],
  account: ["legal_consent"],
} as const;
export type ManageActionTarget = keyof typeof manageActionsByTarget;
export type ManageActionInput = {
  [Target in ManageActionTarget]: {
    kind: "manage_action";
    target: Target;
    action: (typeof manageActionsByTarget)[Target][number];
  };
}[ManageActionTarget];

/** 画面がすでに持つ識別子。管理者の値は管理画面、スタッフの値はスタッフ画面のイベントだけに付ける。 */
export type WebMeasurementIdentity = {
  manager?: {
    userId: string;
    organizationId?: string;
    shopId?: string;
    organizationPlan?: OrganizationPlan;
  };
  staff?: {
    recruitmentId: string;
  };
};

export type WebMeasurementContext = {
  environment: WebMeasurementEnvironment;
  releaseId: string;
  displayMode?: DisplayMode;
  identity?: WebMeasurementIdentity;
};

/** 画面の操作から送るイベント。route familyは送信時の現在pathから決める。 */
export type ProductMeasurementInput =
  | { kind: "setup_complete"; setupKind: SetupKind; submissionPattern: SubmissionPatternKind }
  | { kind: "section_view"; section: MeasuredPageSection }
  | { kind: "shift_export"; format: ShiftExportFormat }
  | { kind: "help_search"; hasResults: boolean; searchTerm?: string }
  | { kind: "plan_checkout_start"; plan: CheckoutPlan }
  | { kind: "security_check_issue"; reason: SecurityCheckIssueReason; errorCode?: string }
  | { kind: "generate_lead" }
  | { kind: "auth_method_select"; method: AuthMethod }
  | { kind: "auth_error"; errorCode?: string }
  | { kind: "demo_progress"; stage: DemoStage }
  | { kind: "onboarding_view"; stage: OnboardingStage }
  | { kind: "onboarding_dismiss"; stage: OnboardingStage }
  | { kind: "promotion_code_apply"; result: PromotionCodeResult }
  | { kind: "staff_add"; method: StaffAddMethod; count: number }
  | { kind: "share"; method: ShareMethod; contentType: ShareContentType }
  | { kind: "recruitment_create" }
  | { kind: "shift_confirm"; intent: ShiftConfirmIntent }
  | { kind: "shift_confirm_blocked"; reason?: string; count: number }
  | { kind: "trial_notice_view"; stage: TrialNoticeStage }
  | { kind: "plan_checkout_result"; result: CheckoutResult }
  | { kind: "home_screen_guide"; action: HomeScreenGuideAction }
  | { kind: "feature_request_submit" }
  | ManageActionInput
  | { kind: "staff_register_submit" }
  | { kind: "staff_legal_consent" }
  | {
      kind: "shift_submit";
      isResubmit: boolean;
      usedPreviousPattern: boolean;
      daysBeforeDeadline: number;
      submissionPattern: SubmissionPatternKind;
      hasDateNotes: boolean;
    }
  | { kind: "staff_link_invalid"; reason: StaffLinkInvalidReason; accessKind: StaffAccessKind }
  | { kind: "staff_link_reissue" }
  | { kind: "app_error"; surface: AppErrorSurface; source: AppErrorSource; errorCode?: string }
  | { kind: "app_timing"; phase: AppTimingPhase; durationMs: number; documentRouteFamily: WebMeasurementRouteFamily };

export type WebMeasurementEvent =
  | {
      kind: "page_view";
      routeFamily: WebMeasurementRouteFamily;
      pageLocation: string;
      pageReferrer?: string;
    }
  | {
      kind: "public_cta";
      ctaId: PublicCtaId;
      routeFamily: WebMeasurementRouteFamily;
    }
  | (ProductMeasurementInput & { routeFamily: WebMeasurementRouteFamily })
  | {
      kind: "web_vital";
      documentRouteFamily: WebMeasurementRouteFamily;
      metricName: "CLS" | "FCP" | "INP" | "LCP" | "TTFB";
      metricValue: number;
      navigationType: Metric["navigationType"];
      rating: Metric["rating"];
      viewportClass: ViewportClass;
    };

type SerializedBase = {
  app_environment: WebMeasurementEnvironment;
  release_id: string;
};

/**
 * GTMのdataLayerは前のpushの値を保持するため、識別子のkeyは毎回置き、値がない場合は`undefined`で上書きする。
 */
type SerializedIdentity = {
  user_id: string | undefined;
  organization_id: string | undefined;
  shop_id: string | undefined;
  organization_plan: OrganizationPlan | undefined;
  recruitment_id: string | undefined;
  display_mode: DisplayMode | undefined;
};

type SerializedRouteContext = SerializedBase &
  SerializedIdentity & {
    route_area: WebMeasurementRouteArea;
    route_family: WebMeasurementRouteFamily;
  };

type BooleanString = "true" | "false";
type NoParams = Record<never, never>;

type SerializedProductParams = {
  setup_complete: { setup_kind: SetupKind; submission_pattern: SubmissionPatternKind };
  section_view: { section: MeasuredPageSection };
  shift_export: { format: ShiftExportFormat };
  help_search: { has_results: BooleanString; search_term: string | undefined };
  plan_checkout_start: { plan: CheckoutPlan };
  security_check_issue: { reason: SecurityCheckIssueReason; error_code: string };
  generate_lead: NoParams;
  auth_method_select: { method: AuthMethod };
  auth_error: { error_code: string };
  demo_progress: { stage: DemoStage };
  onboarding_view: { stage: OnboardingStage };
  onboarding_dismiss: { stage: OnboardingStage };
  promotion_code_apply: { result: PromotionCodeResult };
  staff_add: { method: StaffAddMethod; count: number };
  share: { method: ShareMethod; content_type: ShareContentType };
  recruitment_create: NoParams;
  shift_confirm: { intent: ShiftConfirmIntent };
  shift_confirm_blocked: { reason: string; count: number };
  trial_notice_view: { stage: TrialNoticeStage };
  plan_checkout_result: { result: CheckoutResult };
  home_screen_guide: { action: HomeScreenGuideAction };
  feature_request_submit: NoParams;
  manage_action: { target: ManageActionTarget; action: ManageActionInput["action"] };
  staff_register_submit: NoParams;
  staff_legal_consent: NoParams;
  shift_submit: {
    is_resubmit: BooleanString;
    used_previous_pattern: BooleanString;
    days_before_deadline: DaysBucket;
    submission_pattern: SubmissionPatternKind;
    has_date_notes: BooleanString;
  };
  staff_link_invalid: { reason: StaffLinkInvalidReason; access_kind: StaffAccessKind };
  staff_link_reissue: NoParams;
  app_error: { error_surface: AppErrorSurface; error_source: AppErrorSource; error_code: string };
  app_timing: { phase: AppTimingPhase; metric_value: number; document_route_family: WebMeasurementRouteFamily };
};

type SerializedProductEventName = keyof SerializedProductParams;

type SerializedProductPayload = {
  [Name in SerializedProductEventName]: { event: Name } & SerializedProductParams[Name];
}[SerializedProductEventName];

export type SerializedWebMeasurementEvent =
  | (SerializedRouteContext & { event: "page_view"; page_location: string; page_referrer?: string })
  | (SerializedRouteContext & { event: "select_content"; content_id: PublicCtaId; content_type: "public_cta" })
  | (SerializedRouteContext & SerializedProductPayload)
  | (SerializedBase & {
      event: "web_vital";
      document_route_family: WebMeasurementRouteFamily;
      metric_name: "CLS" | "FCP" | "INP" | "LCP" | "TTFB";
      metric_value: number;
      metric_rating: Metric["rating"];
      navigation_type: Metric["navigationType"];
      viewport_class: ViewportClass;
    });

const environmentSet = new Set<string>(webMeasurementEnvironments);
const metricNames = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"] as const);
const metricRatings = new Set(["good", "needs-improvement", "poor"] as const);
const navigationTypes = new Set([
  "navigate",
  "reload",
  "back-forward",
  "back-forward-cache",
  "prerender",
  "restore",
] as const);

/** Turnstileのerror codeは数字だけを送り、それ以外の値は外部へ渡さない。 */
export function normalizeSecurityCheckErrorCode(value: string | undefined): string {
  if (value === undefined || value === "") return "none";
  return /^\d{1,8}$/.test(value) ? value : "unknown";
}

const MEASUREMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const organizationPlans = new Set<string>(["trial", "free", "standard", "pro"]);

/** Clerkのuser IDとConvexのdocument IDだけを通し、それ以外の文字列は送らない。 */
export function normalizeMeasurementId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && MEASUREMENT_ID_PATTERN.test(normalized) ? normalized : undefined;
}

/**
 * error codeは開発者が定義した英数字だけを送る。
 * 日本語のメッセージや入力値を含み得る文字列は`other`にまとめる。
 */
export function normalizeMeasurementErrorCode(value: string | undefined): string {
  if (value === undefined) return "none";
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "") return "none";
  return /^[a-z][a-z0-9_]{0,47}$/.test(normalized) ? normalized : "other";
}

const MAX_HELP_SEARCH_TERM_LENGTH = 30;

/**
 * 結果が0件の検索語だけを送る。
 * メールアドレス、電話番号、URLのように個人や連絡先を含み得る語は送らない。
 */
export function normalizeHelpSearchTerm(value: string | undefined): string | undefined {
  const normalized = value?.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalized || normalized.length > MAX_HELP_SEARCH_TERM_LENGTH) return undefined;
  if (/@/.test(normalized) || /\d{4,}/.test(normalized) || /https?:|www\./.test(normalized)) return undefined;
  return normalized;
}

/** 残り日数を集計しやすい区分にする。0未満と不明な値は`overdue`にする。 */
export function getDaysBucket(days: number): DaysBucket {
  if (!(days >= 0)) return "overdue";
  const wholeDays = Math.floor(days);
  if (wholeDays === 0) return "0";
  if (wholeDays === 1) return "1";
  if (wholeDays <= 3) return "2_3";
  if (wholeDays <= 7) return "4_7";
  if (wholeDays <= 14) return "8_14";
  return "15_plus";
}

const MAX_MEASUREMENT_COUNT = 1000;

function normalizeCount(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_MEASUREMENT_COUNT, Math.max(0, Math.floor(value))) : 0;
}

function toBooleanString(value: boolean): BooleanString {
  return value ? "true" : "false";
}

function serializeIdentity(routeArea: WebMeasurementRouteArea, context: WebMeasurementContext): SerializedIdentity {
  const manager = routeArea === "manager" ? context.identity?.manager : undefined;
  const staff = routeArea === "staff" ? context.identity?.staff : undefined;
  const organizationPlan = manager?.organizationPlan;
  return {
    user_id: normalizeMeasurementId(manager?.userId),
    organization_id: normalizeMeasurementId(manager?.organizationId),
    shop_id: normalizeMeasurementId(manager?.shopId),
    organization_plan: organizationPlan && organizationPlans.has(organizationPlan) ? organizationPlan : undefined,
    recruitment_id: normalizeMeasurementId(staff?.recruitmentId),
    display_mode: context.displayMode,
  };
}

export function normalizeWebMeasurementEnvironment(value: string): WebMeasurementEnvironment {
  return environmentSet.has(value) ? (value as WebMeasurementEnvironment) : "local";
}

export function normalizeReleaseId(value: string): string {
  const normalized = value.trim();
  return /^[A-Za-z0-9._-]{1,64}$/.test(normalized) ? normalized : "unknown";
}

export function getViewportClass(width: number): ViewportClass {
  return width < 768 ? "mobile" : "desktop";
}

export function buildWebVitalEvent(
  metric: Pick<Metric, "name" | "navigationType" | "rating" | "value">,
  documentRouteFamily: WebMeasurementRouteFamily,
  viewportClass: ViewportClass,
): Extract<WebMeasurementEvent, { kind: "web_vital" }> | null {
  if (
    !metricNames.has(metric.name) ||
    !metricRatings.has(metric.rating) ||
    !navigationTypes.has(metric.navigationType) ||
    !Number.isFinite(metric.value) ||
    metric.value < 0
  ) {
    return null;
  }

  return {
    kind: "web_vital",
    documentRouteFamily,
    metricName: metric.name,
    metricValue: metric.value,
    navigationType: metric.navigationType,
    rating: metric.rating,
    viewportClass,
  };
}

function serializeProductPayload(event: ProductMeasurementInput): SerializedProductPayload {
  switch (event.kind) {
    case "setup_complete":
      return { event: "setup_complete", setup_kind: event.setupKind, submission_pattern: event.submissionPattern };
    case "section_view":
      return { event: "section_view", section: event.section };
    case "shift_export":
      return { event: "shift_export", format: event.format };
    case "help_search":
      return {
        event: "help_search",
        has_results: toBooleanString(event.hasResults),
        search_term: event.hasResults ? undefined : normalizeHelpSearchTerm(event.searchTerm),
      };
    case "plan_checkout_start":
      return { event: "plan_checkout_start", plan: event.plan };
    case "security_check_issue":
      return {
        event: "security_check_issue",
        reason: event.reason,
        error_code: normalizeSecurityCheckErrorCode(event.errorCode),
      };
    case "generate_lead":
    case "recruitment_create":
    case "feature_request_submit":
    case "staff_register_submit":
    case "staff_legal_consent":
    case "staff_link_reissue":
      return { event: event.kind };
    case "auth_method_select":
      return { event: "auth_method_select", method: event.method };
    case "auth_error":
      return { event: "auth_error", error_code: normalizeMeasurementErrorCode(event.errorCode) };
    case "demo_progress":
      return { event: "demo_progress", stage: event.stage };
    case "onboarding_view":
    case "onboarding_dismiss":
      return { event: event.kind, stage: event.stage };
    case "promotion_code_apply":
      return { event: "promotion_code_apply", result: event.result };
    case "staff_add":
      return { event: "staff_add", method: event.method, count: normalizeCount(event.count) };
    case "share":
      return { event: "share", method: event.method, content_type: event.contentType };
    case "shift_confirm":
      return { event: "shift_confirm", intent: event.intent };
    case "shift_confirm_blocked":
      return {
        event: "shift_confirm_blocked",
        reason: normalizeMeasurementErrorCode(event.reason),
        count: normalizeCount(event.count),
      };
    case "trial_notice_view":
      return { event: "trial_notice_view", stage: event.stage };
    case "plan_checkout_result":
      return { event: "plan_checkout_result", result: event.result };
    case "home_screen_guide":
      return { event: "home_screen_guide", action: event.action };
    case "manage_action":
      return { event: "manage_action", target: event.target, action: event.action };
    case "shift_submit":
      return {
        event: "shift_submit",
        is_resubmit: toBooleanString(event.isResubmit),
        used_previous_pattern: toBooleanString(event.usedPreviousPattern),
        days_before_deadline: getDaysBucket(event.daysBeforeDeadline),
        submission_pattern: event.submissionPattern,
        has_date_notes: toBooleanString(event.hasDateNotes),
      };
    case "staff_link_invalid":
      return { event: "staff_link_invalid", reason: event.reason, access_kind: event.accessKind };
    case "app_error":
      return {
        event: "app_error",
        error_surface: event.surface,
        error_source: event.source,
        error_code: normalizeMeasurementErrorCode(event.errorCode),
      };
    case "app_timing":
      return {
        event: "app_timing",
        phase: event.phase,
        metric_value: Number.isFinite(event.durationMs) ? Math.max(0, Math.round(event.durationMs)) : 0,
        document_route_family: event.documentRouteFamily,
      };
  }
}

export function serializeWebMeasurementEvent(
  event: WebMeasurementEvent,
  context: WebMeasurementContext,
): SerializedWebMeasurementEvent {
  const base = {
    app_environment: context.environment,
    release_id: normalizeReleaseId(context.releaseId),
  } as const;
  if (event.kind === "web_vital") {
    return {
      event: "web_vital",
      ...base,
      document_route_family: event.documentRouteFamily,
      metric_name: event.metricName,
      metric_value: event.metricValue,
      metric_rating: event.rating,
      navigation_type: event.navigationType,
      viewport_class: event.viewportClass,
    };
  }

  const routeArea = getWebMeasurementRouteArea(event.routeFamily);
  const route = {
    ...base,
    ...serializeIdentity(routeArea, context),
    route_area: routeArea,
    route_family: event.routeFamily,
  } as const;
  switch (event.kind) {
    case "page_view":
      return {
        event: "page_view",
        ...route,
        page_location: event.pageLocation,
        ...(event.pageReferrer ? { page_referrer: event.pageReferrer } : {}),
      };
    case "public_cta":
      return { event: "select_content", ...route, content_id: event.ctaId, content_type: "public_cta" };
    default:
      return { ...route, ...serializeProductPayload(event) };
  }
}
