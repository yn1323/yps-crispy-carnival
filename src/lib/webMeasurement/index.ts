import {
  type AppErrorSurface,
  type AppTimingPhase,
  buildWebVitalEvent,
  getMeasurementPagePath,
  getViewportClass,
  getWebMeasurementRouteFamily,
  NOT_FOUND_MEASUREMENT_PAGE_PATH,
  normalizeMeasurementPathname,
  normalizeReleaseId,
  normalizeWebMeasurementEnvironment,
  type ProductMeasurementInput,
  type PublicCtaId,
  serializeWebMeasurementEvent,
  type WebMeasurementContext,
  type WebMeasurementIdentity,
} from "@/src/domains/webMeasurement";
import { initGTM, isGtmInitialized, isValidGtmId, pushGtmEvent, resetGTM, stopGTM } from "@/src/lib/gtm";
import { isCurrentWindowStandaloneWebApp } from "@/src/lib/pwaDisplayMode";
import reportWebVitals, { type WebVitalsReporter } from "@/src/reportWebVitals";
import { classifyAppError } from "./appError";

export type WebMeasurementRuntimeConfig = {
  environment: string;
  gtmId: string;
  releaseId: string;
  webVitalsSampleRate: number;
};

type DocumentMeasurementContext = {
  context: WebMeasurementContext;
  documentRouteFamily: ReturnType<typeof getWebMeasurementRouteFamily>;
  isNotFoundDocument: boolean;
  viewportClass: ReturnType<typeof getViewportClass>;
};

type RuntimeDependencies = {
  random?: () => number;
  reportVitals?: (reporter: WebVitalsReporter) => Promise<void>;
};

let documentContext: DocumentMeasurementContext | null = null;
let lastPageViewPathname: string | null = null;
let lastPageLocation: string | null = null;
let webVitalsStarted = false;
let identity: WebMeasurementIdentity = {};
const sentAppTimingPhases = new Set<AppTimingPhase>();
const deployMeasurementEnvironments = new Set(["develop", "preview", "production"]);

function normalizeSampleRate(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function isWebMeasurementRuntimeEnabled(config: WebMeasurementRuntimeConfig): boolean {
  const releaseId = normalizeReleaseId(config.releaseId);
  return (
    isValidGtmId(config.gtmId) &&
    deployMeasurementEnvironments.has(config.environment) &&
    releaseId !== "unknown" &&
    releaseId !== "local"
  );
}

function getSerializationContext(context: WebMeasurementContext): WebMeasurementContext {
  return { ...context, identity };
}

function getDisplayMode(): WebMeasurementContext["displayMode"] {
  try {
    return isCurrentWindowStandaloneWebApp() ? "standalone" : "browser";
  } catch {
    return undefined;
  }
}

export function hasActiveWebMeasurement(): boolean {
  return documentContext !== null && isGtmInitialized();
}

export function initializeDocumentWebMeasurement(
  {
    config,
    currentPathname,
    initialDocumentPathname,
    isNotFoundDocument = false,
    viewportWidth,
  }: {
    config: WebMeasurementRuntimeConfig;
    currentPathname: string;
    initialDocumentPathname: string;
    /** Cloudflareが未知URLへ返す静的404。記事slugなど既知routeの形をしたpathでも404として数える。 */
    isNotFoundDocument?: boolean;
    viewportWidth: number;
  },
  dependencies: RuntimeDependencies = {},
): "disabled" | "initialized" | "transport_unavailable" {
  if (!isWebMeasurementRuntimeEnabled(config)) return "disabled";

  if (!documentContext) {
    documentContext = {
      context: {
        environment: normalizeWebMeasurementEnvironment(config.environment),
        releaseId: normalizeReleaseId(config.releaseId),
        displayMode: getDisplayMode(),
      },
      documentRouteFamily: isNotFoundDocument ? "not_found" : getWebMeasurementRouteFamily(initialDocumentPathname),
      isNotFoundDocument,
      viewportClass: getViewportClass(viewportWidth),
    };
  }

  if (!isGtmInitialized() && !initGTM(config.gtmId)) return "transport_unavailable";
  trackPageView(currentPathname);

  const sampleRate = normalizeSampleRate(config.webVitalsSampleRate);
  const random = dependencies.random ?? Math.random;
  if (!webVitalsStarted && sampleRate > 0 && random() < sampleRate) {
    webVitalsStarted = true;
    const reportVitals = dependencies.reportVitals ?? reportWebVitals;
    void reportVitals((metric) => {
      if (!documentContext || !isGtmInitialized()) return;
      const event = buildWebVitalEvent(metric, documentContext.documentRouteFamily, documentContext.viewportClass);
      if (event) pushGtmEvent(serializeWebMeasurementEvent(event, documentContext.context));
    }).catch(() => {
      // 計測失敗は公開ページの操作や遷移を失敗させない。
    });
  }

  return "initialized";
}

export function trackPageView(pathname: string): boolean {
  if (!documentContext || !isGtmInitialized()) return false;

  const normalizedPathname = normalizeMeasurementPathname(pathname);
  if (lastPageViewPathname === normalizedPathname) return false;

  const routeFamily = documentContext.isNotFoundDocument ? "not_found" : getWebMeasurementRouteFamily(pathname);
  // OAuthとLINE連携のcallbackは通過するだけの画面なので、page viewを数えない。
  if (routeFamily === "callback") return false;

  const pagePath = routeFamily === "not_found" ? NOT_FOUND_MEASUREMENT_PAGE_PATH : getMeasurementPagePath(pathname);
  const pageLocation = `${window.location.origin}${pagePath}`;
  const sent = pushGtmEvent(
    serializeWebMeasurementEvent(
      {
        kind: "page_view",
        routeFamily,
        pageLocation,
        // 初回はGA4がdocument.referrerを使う。SPA遷移では直前の画面を参照元にする。
        ...(lastPageLocation ? { pageReferrer: lastPageLocation } : {}),
      },
      getSerializationContext(documentContext.context),
    ),
  );
  if (sent) {
    lastPageViewPathname = normalizedPathname;
    lastPageLocation = pageLocation;
  }
  return sent;
}

export function trackPublicCta(ctaId: PublicCtaId, pathname = window.location.pathname): boolean {
  if (!documentContext || !isGtmInitialized()) return false;

  return pushGtmEvent(
    serializeWebMeasurementEvent(
      { kind: "public_cta", ctaId, routeFamily: getWebMeasurementRouteFamily(pathname) },
      getSerializationContext(documentContext.context),
    ),
  );
}

export function trackProductEvent(input: ProductMeasurementInput, pathname = window.location.pathname): boolean {
  if (!documentContext || !isGtmInitialized()) return false;

  try {
    return pushGtmEvent(
      serializeWebMeasurementEvent(
        { ...input, routeFamily: getWebMeasurementRouteFamily(pathname) },
        getSerializationContext(documentContext.context),
      ),
    );
  } catch {
    // 計測の失敗を、呼び出し元の操作やエラー表示へ伝播させない。
    return false;
  }
}

/** AuthGuardが確定した管理者と選択中の店舗を、以後の管理画面のイベントへ付ける。 */
export function setManagerMeasurementIdentity(manager: WebMeasurementIdentity["manager"] | null): void {
  identity = { ...identity, manager: manager ?? undefined };
}

/** 検証済みのスタッフsessionの募集を、以後のスタッフ画面のイベントへ付ける。 */
export function setStaffMeasurementIdentity(staff: WebMeasurementIdentity["staff"] | null): void {
  identity = { ...identity, staff: staff ?? undefined };
}

/** 画面に表示したエラーを、messageを含めずに送る。 */
export function trackAppError(surface: AppErrorSurface, error: unknown): boolean {
  if (!documentContext || !isGtmInitialized()) return false;

  try {
    const { source, errorCode } = classifyAppError(error, surface);
    return trackProductEvent({ kind: "app_error", surface, source, ...(errorCode ? { errorCode } : {}) });
  } catch {
    return false;
  }
}

/**
 * documentの開始から各段階までの時間を、Web Vitalsのsampling対象documentで一度だけ送る。
 * 初回表示の遅さの原因を、Clerkの読み込み、ユーザー情報の取得、画面表示に分けて見るために使う。
 */
export function trackAppTiming(phase: AppTimingPhase): boolean {
  if (!documentContext || !isGtmInitialized() || !webVitalsStarted || sentAppTimingPhases.has(phase)) return false;
  if (typeof performance === "undefined" || typeof performance.now !== "function") return false;

  sentAppTimingPhases.add(phase);
  return trackProductEvent({
    kind: "app_timing",
    phase,
    durationMs: performance.now(),
    documentRouteFamily: documentContext.documentRouteFamily,
  });
}

export function stopDocumentWebMeasurement(): void {
  stopGTM();
  documentContext = null;
  lastPageViewPathname = null;
  lastPageLocation = null;
  webVitalsStarted = false;
  identity = {};
  sentAppTimingPhases.clear();
}

export function resetWebMeasurementForTests(): void {
  resetGTM();
  documentContext = null;
  lastPageViewPathname = null;
  lastPageLocation = null;
  webVitalsStarted = false;
  identity = {};
  sentAppTimingPhases.clear();
}
