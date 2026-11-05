import { Alert, Box, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuCircleCheck, LuRefreshCw } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { SecurityCheckIssueReason } from "@/src/domains/webMeasurement";
import { trackProductEvent } from "@/src/lib/webMeasurement";

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      appearance: "interaction-only";
      size: "compact" | "flexible";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": (errorCode: string) => boolean;
      "timeout-callback": () => void;
      "unsupported-callback": () => void;
      "before-interactive-callback": () => void;
      "after-interactive-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** 送信操作を受けた時点で確認が終わっていない場合に、フォーム側が表示する案内。 */
export const VERIFICATION_REQUIRED_MESSAGE = "セキュリティ確認が終わってから、もう一度押してください。";

/** 通常は数秒で終わる確認が、この時間を過ぎても終わらない場合に案内を切り替える。 */
export const TURNSTILE_STALL_TIMEOUT_MS = 15_000;

const SCRIPT_ID = "cloudflare-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  const promise = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    const handleLoad = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile API was not loaded"));
    };
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", () => reject(new Error("Turnstile script could not be loaded")), { once: true });
    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  scriptPromise = promise;
  // 読み込み失敗を保持すると「もう一度確認する」でも復旧できないため、次回は読み込み直す。
  promise.catch(() => {
    if (scriptPromise === promise) scriptPromise = null;
    document.getElementById(SCRIPT_ID)?.remove();
  });
  return promise;
}

type VerificationPhase = "verifying" | "interactive" | "verified" | "stalled" | "failed";

type TurnstileWidgetProps = {
  action: string;
  onError: (errorCode?: string) => void;
  onVerify: (token: string) => void;
  siteKey: string;
  /** 確認を完了できない場合に、フォームごとの別の手段を案内する。 */
  troubleGuidance?: string;
  stallTimeoutMs?: number;
};

export function TurnstileWidget(props: TurnstileWidgetProps) {
  const [attempt, setAttempt] = useState(0);
  const { onVerify } = props;

  const handleRetry = useCallback(() => {
    onVerify("");
    setAttempt((current) => current + 1);
  }, [onVerify]);

  if (!props.siteKey) {
    return (
      <Text color="red.600" fontSize="sm">
        セキュリティ確認を読み込めませんでした。
      </Text>
    );
  }

  // やり直しでは、表示状態と送信済みの計測を含めて確認を最初から作り直す。
  return <TurnstileVerification key={attempt} {...props} onRetry={handleRetry} />;
}

function TurnstileVerification({
  action,
  onError,
  onVerify,
  siteKey,
  troubleGuidance,
  stallTimeoutMs = TURNSTILE_STALL_TIMEOUT_MS,
  onRetry,
}: TurnstileWidgetProps & { onRetry: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<VerificationPhase>("verifying");
  const reportedReasonsRef = useRef(new Set<SecurityCheckIssueReason>());

  const reportIssue = useCallback((reason: SecurityCheckIssueReason, errorCode?: string) => {
    // 自動再試行のたびに同じ失敗を送らないよう、確認のやり直し単位で一度だけ送る。
    if (reportedReasonsRef.current.has(reason)) return;
    reportedReasonsRef.current.add(reason);
    if (import.meta.env.DEV) console.warn("Turnstile verification issue", { reason, errorCode });
    trackProductEvent({ kind: "security_check_issue", reason, errorCode });
  }, []);

  useEffect(() => {
    let disposed = false;
    let widgetId: string | null = null;

    const fail = (reason: SecurityCheckIssueReason, errorCode?: string) => {
      if (disposed) return;
      reportIssue(reason, errorCode);
      setPhase("failed");
      onError(errorCode);
    };

    void loadTurnstile()
      .then((api) => {
        if (disposed || !containerRef.current) return;
        widgetId = api.render(containerRef.current, {
          sitekey: siteKey,
          action,
          appearance: "interaction-only",
          size: window.matchMedia("(max-width: 359px)").matches ? "compact" : "flexible",
          callback: (token) => {
            if (disposed) return;
            setPhase("verified");
            onVerify(token);
          },
          "expired-callback": () => {
            if (disposed) return;
            // 期限切れのtokenはTurnstileが自動で取り直すため、確認中へ戻す。
            setPhase("verifying");
            onVerify("");
          },
          "error-callback": (errorCode) => {
            fail("error", errorCode);
            return true;
          },
          "timeout-callback": () => fail("interactive_timeout"),
          "unsupported-callback": () => fail("unsupported"),
          "before-interactive-callback": () => {
            if (!disposed) setPhase("interactive");
          },
          "after-interactive-callback": () => {
            if (!disposed) setPhase((current) => (current === "interactive" ? "verifying" : current));
          },
        });
      })
      .catch(() => fail("script_load_failed"));

    return () => {
      disposed = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [action, onError, onVerify, reportIssue, siteKey]);

  useEffect(() => {
    if (phase !== "verifying") return;
    // 確認は止めずに案内だけを切り替え、遅れて完了した場合はそのまま送信できるようにする。
    const timer = window.setTimeout(() => {
      setPhase((current) => (current === "verifying" ? "stalled" : current));
      reportIssue("stalled");
    }, stallTimeoutMs);
    return () => window.clearTimeout(timer);
  }, [phase, reportIssue, stallTimeoutMs]);

  return (
    <Stack gap={3}>
      <VerificationStatus phase={phase} troubleGuidance={troubleGuidance} onRetry={onRetry} />
      <Box ref={containerRef} role="group" aria-label="セキュリティ確認" overflowX="auto" />
    </Stack>
  );
}

function VerificationStatus({
  phase,
  troubleGuidance,
  onRetry,
}: {
  phase: VerificationPhase;
  troubleGuidance?: string;
  onRetry: () => void;
}) {
  if (phase === "verifying") {
    return (
      <HStack gap={2} color="fg.muted" role="status">
        <Spinner size="xs" />
        <Text fontSize="sm">セキュリティ確認をしています</Text>
      </HStack>
    );
  }

  if (phase === "interactive") {
    return (
      <Text fontSize="sm" color="gray.800" role="status">
        下に表示された確認欄にチェックを入れてください。
      </Text>
    );
  }

  if (phase === "verified") {
    return (
      <HStack gap={2} color="green.700" role="status">
        <LuCircleCheck aria-hidden />
        <Text fontSize="sm">セキュリティ確認が完了しました</Text>
      </HStack>
    );
  }

  const isStalled = phase === "stalled";
  return (
    <Alert.Root status={isStalled ? "warning" : "error"} role="alert" alignItems="flex-start">
      <Alert.Indicator />
      <Alert.Content gap={3}>
        <Stack gap={1}>
          <Alert.Title>
            {isStalled ? "セキュリティ確認に時間がかかっています" : "セキュリティ確認を完了できませんでした"}
          </Alert.Title>
          <Alert.Description whiteSpace="pre-line">
            {"Wi-Fiとモバイル通信を切り替えるか、広告ブロックなどの機能をオフにしてから、もう一度確認してください。"}
            {troubleGuidance ? `\n${troubleGuidance}` : ""}
          </Alert.Description>
        </Stack>
        <Box>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <LuRefreshCw aria-hidden />
            もう一度確認する
          </Button>
        </Box>
      </Alert.Content>
    </Alert.Root>
  );
}
