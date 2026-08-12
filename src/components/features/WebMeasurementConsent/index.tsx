import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { WEB_MEASUREMENT_RUNTIME_CONFIG } from "@/src/configs/webMeasurement";
import { classifyWebMeasurementRoute, isPublicMeasurementDocument } from "@/src/domains/webMeasurement";
import {
  hasActiveWebMeasurement,
  initializeDocumentWebMeasurement,
  isWebMeasurementRuntimeEnabled,
  stopDocumentWebMeasurement,
  trackPublicPageView,
} from "@/src/lib/webMeasurement";
import {
  clearWebMeasurementReloadGuard,
  hasWebMeasurementReloadGuard,
  readWebMeasurementConsent,
  WEB_MEASUREMENT_CONSENT_STORAGE_KEY,
  type WebMeasurementConsentDecision,
  writeWebMeasurementConsent,
  writeWebMeasurementReloadGuard,
} from "./consentStorage";
import { WebMeasurementConsentView } from "./WebMeasurementConsentView";

type LoadedDecision = Exclude<WebMeasurementConsentDecision, "unknown"> | "unknown";

type Props = {
  reloadDocument?: () => void;
};

const reloadCurrentDocument = () => window.location.reload();

function scheduleAfterInitialPaint(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const requestId = window.requestIdleCallback(callback, { timeout: 5000 });
    return () => window.cancelIdleCallback(requestId);
  }

  const timeoutId = window.setTimeout(callback, 3000);
  return () => window.clearTimeout(timeoutId);
}

export function WebMeasurementConsent({ reloadDocument = reloadCurrentDocument }: Props = {}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const initialDocumentPathname = useRef<string | null>(null);
  const [decision, setDecision] = useState<LoadedDecision | "loading">("loading");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const isConfigured = isWebMeasurementRuntimeEnabled(WEB_MEASUREMENT_RUNTIME_CONFIG);

  if (initialDocumentPathname.current === null && typeof window !== "undefined") {
    initialDocumentPathname.current = window.location.pathname;
  }

  useEffect(() => {
    if (!isConfigured) return;
    if (hasWebMeasurementReloadGuard(window.sessionStorage, window.history)) {
      setDecision("unknown");
      return;
    }
    setDecision(readWebMeasurementConsent(window.localStorage));
  }, [isConfigured]);

  useEffect(() => {
    if (!isConfigured || decision !== "granted" || !initialDocumentPathname.current) return;

    const currentRoute = classifyWebMeasurementRoute(pathname);
    if (hasActiveWebMeasurement()) {
      if (currentRoute.surface === "measured_public") {
        trackPublicPageView(pathname);
        return;
      }

      stopDocumentWebMeasurement();
      reloadDocument();
      return;
    }

    if (currentRoute.surface !== "measured_public") return;

    return scheduleAfterInitialPaint(() => {
      if (!initialDocumentPathname.current) return;
      initializeDocumentWebMeasurement({
        config: WEB_MEASUREMENT_RUNTIME_CONFIG,
        currentPathname: window.location.pathname,
        initialDocumentPathname: initialDocumentPathname.current,
        viewportWidth: window.innerWidth,
      });
    });
  }, [decision, isConfigured, pathname, reloadDocument]);

  useEffect(() => {
    if (!isConfigured) return;

    const handleConsentStorageChange = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
      if (event.key !== null && event.key !== WEB_MEASUREMENT_CONSENT_STORAGE_KEY) return;

      // 別tabの許可も同意前documentへ遡及適用せず、拒否・削除・不正値も即時にfail closedとする。
      stopDocumentWebMeasurement();
      if (
        (event.newValue === "granted" || event.newValue === "denied") &&
        hasWebMeasurementReloadGuard(window.sessionStorage, window.history)
      ) {
        clearWebMeasurementReloadGuard(window.sessionStorage, window.history);
      }
      setDecision("loading");
      setIsSettingsOpen(false);
      reloadDocument();
    };

    window.addEventListener("storage", handleConsentStorageChange);
    return () => window.removeEventListener("storage", handleConsentStorageChange);
  }, [isConfigured, reloadDocument]);

  if (!isConfigured || decision === "loading" || !isPublicMeasurementDocument(pathname)) return null;

  const choose = (nextDecision: Exclude<WebMeasurementConsentDecision, "unknown">) => {
    const isActive = hasActiveWebMeasurement();
    const hadReloadGuard = hasWebMeasurementReloadGuard(window.sessionStorage, window.history);
    const isRevokingStoredGrant = nextDecision === "denied" && decision === "granted";
    const mustReload = nextDecision === "denied" && isActive;
    const isStored = writeWebMeasurementConsent(window.localStorage, nextDecision);
    if (!isStored) {
      // 永続化できていない状態を「不許可」と確定表示しない。activeなら第三者codeを新documentで破棄する。
      const isGuarded = isRevokingStoredGrant && writeWebMeasurementReloadGuard(window.sessionStorage, window.history);
      if (isActive) {
        stopDocumentWebMeasurement();
        // staleなlocalStorage=grantedをreload後に読み直して再起動しないよう、同じtabを閉じたままにする。
        if (isGuarded) reloadDocument();
      }
      setDecision("unknown");
      setIsSettingsOpen(false);
      return;
    }

    if (hadReloadGuard) {
      clearWebMeasurementReloadGuard(window.sessionStorage, window.history);
      if (hasWebMeasurementReloadGuard(window.sessionStorage, window.history)) {
        if (isActive) stopDocumentWebMeasurement();
        setDecision("unknown");
        setIsSettingsOpen(false);
        return;
      }
    }

    if (nextDecision === "granted" && decision !== "granted") {
      // buffered PerformanceEntryなど、同意前のdocument状態を許可後に遡及送信しない。
      reloadDocument();
      return;
    }

    setDecision(nextDecision);
    setIsSettingsOpen(false);

    if (mustReload) {
      stopDocumentWebMeasurement();
      reloadDocument();
    }
  };

  if (decision === "unknown" || isSettingsOpen) {
    return (
      <WebMeasurementConsentView mode="prompt" onDeny={() => choose("denied")} onGrant={() => choose("granted")} />
    );
  }

  return (
    <WebMeasurementConsentView mode="settled" decision={decision} onOpenSettings={() => setIsSettingsOpen(true)} />
  );
}
