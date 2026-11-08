import { describe, expect, it } from "vitest";
import {
  buildWebVitalEvent,
  getDaysBucket,
  getViewportClass,
  normalizeMeasurementErrorCode,
  normalizeReleaseId,
  normalizeWebMeasurementEnvironment,
  serializeWebMeasurementEvent,
} from ".";

const context = { environment: "preview", releaseId: "abc123" } as const;

describe("Web計測event serializer", () => {
  it("page viewは集計用URLと利用者の区分だけを持つexact payloadにする", () => {
    const event = {
      kind: "page_view",
      routeFamily: "article_detail",
      pageLocation: "https://shiftori.app/articles/shiftori-line-workflow",
      pageReferrer: "https://shiftori.app/",
      rawUrl: "/articles/private-id?token=secret",
      title: "secret",
    } as const;

    expect(serializeWebMeasurementEvent(event, context)).toEqual({
      event: "page_view",
      app_environment: "preview",
      page_location: "https://shiftori.app/articles/shiftori-line-workflow",
      page_referrer: "https://shiftori.app/",
      release_id: "abc123",
      route_area: "public",
      route_family: "article_detail",
    });
  });

  it("初回page viewは参照元を上書きしない", () => {
    expect(
      serializeWebMeasurementEvent(
        { kind: "page_view", routeFamily: "dashboard", pageLocation: "https://shiftori.app/dashboard" },
        context,
      ),
    ).not.toHaveProperty("page_referrer");
  });

  it("CTAは登録済みIDとroute familyだけを送る", () => {
    expect(
      serializeWebMeasurementEvent(
        { kind: "public_cta", ctaId: "article_cta", routeFamily: "article_detail" },
        context,
      ),
    ).toEqual({
      event: "select_content",
      app_environment: "preview",
      content_id: "article_cta",
      content_type: "public_cta",
      release_id: "abc123",
      route_area: "public",
      route_family: "article_detail",
    });
  });

  it.each([
    {
      name: "setup_complete",
      event: { kind: "setup_complete", setupKind: "first", submissionPattern: "shiftType", routeFamily: "dashboard" },
      expected: { setup_kind: "first", submission_pattern: "shiftType", route_area: "manager" },
    },
    {
      name: "section_view",
      event: { kind: "section_view", section: "pricing", routeFamily: "home" },
      expected: { section: "pricing", route_area: "public" },
    },
    {
      name: "shift_export",
      event: { kind: "shift_export", format: "xlsx", routeFamily: "shift_export" },
      expected: { format: "xlsx", route_area: "manager" },
    },
    {
      name: "help_search",
      event: { kind: "help_search", hasResults: false, routeFamily: "help_index" },
      expected: { has_results: "false", route_area: "public" },
    },
    {
      name: "plan_checkout_start",
      event: { kind: "plan_checkout_start", plan: "pro", routeFamily: "billing" },
      expected: { plan: "pro", route_area: "manager" },
    },
    {
      name: "security_check_issue",
      event: { kind: "security_check_issue", reason: "error", errorCode: "300030", routeFamily: "staff_register" },
      expected: { reason: "error", error_code: "300030", route_area: "staff" },
    },
  ] as const)("$nameを有限値だけのexact payloadにする", ({ name, event, expected }) => {
    expect(serializeWebMeasurementEvent(event, context)).toEqual({
      event: name,
      app_environment: "preview",
      release_id: "abc123",
      route_family: event.routeFamily,
      ...expected,
    });
  });

  it.each([
    {
      name: "generate_lead",
      event: { kind: "generate_lead", routeFamily: "contact" },
      expected: { route_area: "public" },
    },
    {
      name: "auth_method_select",
      event: { kind: "auth_method_select", method: "google", routeFamily: "auth_signup" },
      expected: { method: "google", route_area: "auth" },
    },
    {
      name: "auth_error",
      event: { kind: "auth_error", errorCode: "form_password_incorrect", routeFamily: "auth_login" },
      expected: { error_code: "form_password_incorrect", route_area: "auth" },
    },
    {
      name: "demo_progress",
      event: { kind: "demo_progress", stage: "tour_start", routeFamily: "demo_shiftboard" },
      expected: { stage: "tour_start", route_area: "public" },
    },
    {
      name: "onboarding_view",
      event: { kind: "onboarding_view", stage: "add_staff", routeFamily: "dashboard" },
      expected: { stage: "add_staff", route_area: "manager" },
    },
    {
      name: "staff_add",
      event: { kind: "staff_add", method: "manual", count: 3.7, routeFamily: "dashboard" },
      expected: { method: "manual", count: 3, route_area: "manager" },
    },
    {
      name: "share",
      event: { kind: "share", method: "copy", contentType: "staff_registration_link", routeFamily: "dashboard" },
      expected: { method: "copy", content_type: "staff_registration_link", route_area: "manager" },
    },
    {
      name: "shift_confirm_blocked",
      event: { kind: "shift_confirm_blocked", reason: "CLOSED_DAY", count: 2, routeFamily: "shiftboard" },
      expected: { reason: "closed_day", count: 2, route_area: "manager" },
    },
    {
      name: "trial_notice_view",
      event: { kind: "trial_notice_view", stage: "last_day", routeFamily: "dashboard" },
      expected: { stage: "last_day", route_area: "manager" },
    },
    {
      name: "manage_action",
      event: { kind: "manage_action", target: "billing", action: "schedule_stop", routeFamily: "billing" },
      expected: { target: "billing", action: "schedule_stop", route_area: "manager" },
    },
    {
      name: "shift_submit",
      event: {
        kind: "shift_submit",
        isResubmit: true,
        usedPreviousPattern: false,
        daysBeforeDeadline: 5,
        submissionPattern: "dateOnly",
        hasDateNotes: true,
        routeFamily: "staff_submit",
      },
      expected: {
        is_resubmit: "true",
        used_previous_pattern: "false",
        days_before_deadline: "4_7",
        submission_pattern: "dateOnly",
        has_date_notes: "true",
        route_area: "staff",
      },
    },
    {
      name: "staff_link_invalid",
      event: { kind: "staff_link_invalid", reason: "unknown_link", accessKind: "view", routeFamily: "staff_view" },
      expected: { reason: "unknown_link", access_kind: "view", route_area: "staff" },
    },
    {
      name: "app_error",
      event: {
        kind: "app_error",
        surface: "toast",
        source: "server_business",
        errorCode: "Not found",
        routeFamily: "staff_detail",
      },
      expected: {
        error_surface: "toast",
        error_source: "server_business",
        error_code: "not_found",
        route_area: "manager",
      },
    },
    {
      name: "app_timing",
      event: {
        kind: "app_timing",
        phase: "app_ready",
        durationMs: 1234.6,
        documentRouteFamily: "dashboard",
        routeFamily: "dashboard",
      },
      expected: { phase: "app_ready", metric_value: 1235, document_route_family: "dashboard", route_area: "manager" },
    },
  ] as const)("$nameを画面が持つ有限値だけで送る", ({ name, event, expected }) => {
    expect(serializeWebMeasurementEvent(event, context)).toEqual({
      event: name,
      app_environment: "preview",
      release_id: "abc123",
      route_family: event.routeFamily,
      ...expected,
    });
  });

  it("識別子は所属する画面の区分だけに付け、値がないkeyも毎回上書きする", () => {
    const identityContext = {
      ...context,
      displayMode: "standalone",
      identity: {
        manager: { userId: "user_2abc", organizationId: "org123", shopId: "shop456", organizationPlan: "pro" },
        staff: { recruitmentId: "recruitment789" },
      },
    } as const;

    const managerEvent = serializeWebMeasurementEvent(
      { kind: "manage_action", target: "shift", action: "save", routeFamily: "shiftboard" },
      identityContext,
    );
    expect(managerEvent).toMatchObject({
      user_id: "user_2abc",
      organization_id: "org123",
      shop_id: "shop456",
      organization_plan: "pro",
      recruitment_id: undefined,
      display_mode: "standalone",
    });

    const staffEvent = serializeWebMeasurementEvent(
      { kind: "staff_link_reissue", routeFamily: "staff_reissue" },
      identityContext,
    );
    expect(staffEvent).toMatchObject({ recruitment_id: "recruitment789", user_id: undefined, shop_id: undefined });

    const publicEvent = serializeWebMeasurementEvent(
      { kind: "page_view", routeFamily: "home", pageLocation: "https://shiftori.app/" },
      identityContext,
    );
    for (const key of ["user_id", "organization_id", "shop_id", "organization_plan", "recruitment_id"]) {
      expect(Object.keys(publicEvent)).toContain(key);
      expect(publicEvent[key as keyof typeof publicEvent]).toBeUndefined();
    }
  });

  it("IDの形をしていない識別子は送らない", () => {
    expect(
      serializeWebMeasurementEvent(
        { kind: "generate_lead", routeFamily: "dashboard" },
        { ...context, identity: { manager: { userId: "user@example.com", shopId: "shop id" } } },
      ),
    ).toMatchObject({ user_id: undefined, shop_id: undefined });
  });

  it.each(["山田 太郎", "+33 6 12 34 56 78", "090-1234-5678", "taro@example.com"])(
    "ヘルプ検索の自由入力はGA4へ送らない（%s）",
    (searchTerm) => {
      // 型で検索語を受け取らないことに加え、呼び出し元が余分な値を渡してもpayloadへ載せない。
      const event = { kind: "help_search" as const, hasResults: false, searchTerm, routeFamily: "help_index" as const };
      const payload = serializeWebMeasurementEvent(event, context);
      expect(payload).not.toHaveProperty("search_term");
      expect(JSON.stringify(payload)).not.toContain(searchTerm);
      expect(payload).toMatchObject({ event: "help_search", has_results: "false" });
    },
  );

  it("error code・日数を有限値へ正規化する", () => {
    expect(normalizeMeasurementErrorCode(undefined)).toBe("none");
    expect(normalizeMeasurementErrorCode("RECRUITMENT_CHANGED")).toBe("recruitment_changed");
    expect(normalizeMeasurementErrorCode("提出期限を過ぎています")).toBe("other");
    expect(getDaysBucket(-1)).toBe("overdue");
    expect(getDaysBucket(Number.NaN)).toBe("overdue");
    expect(getDaysBucket(0)).toBe("0");
    expect(getDaysBucket(3)).toBe("2_3");
    expect(getDaysBucket(14)).toBe("8_14");
    expect(getDaysBucket(15)).toBe("15_plus");
  });

  it.each([
    { errorCode: undefined, expected: "none" },
    { errorCode: "", expected: "none" },
    { errorCode: "110200", expected: "110200" },
    { errorCode: "token=abc", expected: "unknown" },
  ])("セキュリティ確認のerror code $errorCode を数字だけに正規化する", ({ errorCode, expected }) => {
    expect(
      serializeWebMeasurementEvent(
        { kind: "security_check_issue", reason: "stalled", errorCode, routeFamily: "contact" },
        context,
      ),
    ).toMatchObject({ event: "security_check_issue", error_code: expected });
  });

  it("Web Vitalsはdocument routeと低cardinality値だけを送る", () => {
    const event = buildWebVitalEvent(
      { name: "LCP", value: 1234.5, rating: "good", navigationType: "navigate" },
      "home",
      "mobile",
    );
    expect(event).not.toBeNull();
    if (!event) return;

    expect(serializeWebMeasurementEvent(event, context)).toEqual({
      event: "web_vital",
      app_environment: "preview",
      document_route_family: "home",
      metric_name: "LCP",
      metric_value: 1234.5,
      metric_rating: "good",
      navigation_type: "navigate",
      release_id: "abc123",
      viewport_class: "mobile",
    });
  });

  it.each([
    { name: "LCP", value: Number.NaN, rating: "good", navigationType: "navigate" },
    { name: "LCP", value: -1, rating: "good", navigationType: "navigate" },
    { name: "UNKNOWN", value: 1, rating: "good", navigationType: "navigate" },
  ])("不正なmetricを破棄する", (metric) => {
    expect(buildWebVitalEvent(metric as never, "home", "desktop")).toBeNull();
  });

  it("environment・release・viewportを有限値へ正規化する", () => {
    expect(normalizeWebMeasurementEnvironment("production")).toBe("production");
    expect(normalizeWebMeasurementEnvironment("customer-name")).toBe("local");
    expect(normalizeReleaseId(" release_2026-08-12 ")).toBe("release_2026-08-12");
    expect(normalizeReleaseId("secret/value")).toBe("unknown");
    expect(getViewportClass(767)).toBe("mobile");
    expect(getViewportClass(768)).toBe("desktop");
  });
});
