import { useCallback, useState } from "react";
import type { StaffRegistrationFormData } from "@/convex/staffRegistration/schemas";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { VERIFICATION_REQUIRED_MESSAGE } from "@/src/components/shared/TurnstileWidget";
import { TURNSTILE_SITE_KEY } from "@/src/configs/publicEnv";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { trackProductEvent } from "@/src/lib/webMeasurement";
import {
  canReusePendingVerification,
  type PendingStaffRegistrationVerification,
  readPendingVerification,
  resolveSessionStorage,
  writePendingVerification,
} from "./pendingVerification";
import {
  confirmStaffRegistrationCode,
  resendStaffRegistrationCode,
  StaffRegistrationApiError,
  startStaffRegistrationVerification,
} from "./staffRegistrationVerificationApi";
import type { StaffRegistrationCodeStep } from "./types";

/**
 * 参加申請の送信状態を持つ。入力内容を送ると確認コードの入力待ちになり、コードが合うと申請完了になる。
 */
export function useStaffRegistrationController(token: string | undefined) {
  const [isSubmitted, setSubmitted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  // 再読み込み後も確認コードの入力から続けられるよう、同じtabに残した入力待ちを最初に読む。
  const [pending, setPendingState] = useState<PendingStaffRegistrationVerification | null>(() =>
    token ? readPendingVerification(resolveSessionStorage(), token, Date.now()) : null,
  );
  const [initialFormValues] = useState(() => (pending ? { name: pending.name, email: pending.email } : undefined));
  const [isCodeStepOpen, setCodeStepOpen] = useState(pending !== null);

  const setPending = useCallback(
    (next: PendingStaffRegistrationVerification | null) => {
      setPendingState(next);
      if (token) writePendingVerification(resolveSessionStorage(), token, next);
    },
    [token],
  );

  const handleVerified = useCallback((verifiedToken: string) => {
    setTurnstileToken(verifiedToken);
    setVerificationError(null);
  }, []);

  // 失敗の案内と再試行は確認欄が表示するため、ここでは使えなくなったtokenだけを捨てる。
  const handleVerificationError = useCallback(() => {
    setTurnstileToken("");
  }, []);

  // Turnstileのtokenは1回しか使えないため、送信のたびに確認欄を作り直す。
  const resetTurnstile = useCallback(() => {
    setTurnstileToken("");
    setTurnstileKey((current) => current + 1);
  }, []);

  const { run: handleSubmit, isRunning: isSubmitting } = useSingleFlight(
    async (formData: StaffRegistrationFormData) => {
      if (!token) return;
      if (canReusePendingVerification(pending, formData, Date.now())) {
        setCodeStepOpen(true);
        return;
      }
      if (!turnstileToken) {
        // site key未設定なら確認欄が読み込めない旨を表示するため、待機案内を重ねない。
        if (TURNSTILE_SITE_KEY) setVerificationError(VERIFICATION_REQUIRED_MESSAGE);
        return;
      }

      try {
        const sent = await startStaffRegistrationVerification({
          token,
          name: formData.name,
          email: formData.email,
          acceptedLegal: formData.acceptedLegal,
          turnstileToken,
          requestId: crypto.randomUUID(),
        });
        const now = Date.now();
        setPending({
          name: formData.name,
          email: formData.email,
          verificationToken: sent.verificationToken,
          resendAvailableAt: now + sent.resendAfterMs,
          codeExpiresAt: now + sent.codeTtlMs,
        });
        setCodeError(null);
        setCodeStepOpen(true);
      } catch (error) {
        showErrorToast(error);
      } finally {
        resetTurnstile();
      }
    },
  );

  const { run: handleConfirmCode, isRunning: isConfirming } = useSingleFlight(async (code: string) => {
    if (!token || !pending) return;
    try {
      await confirmStaffRegistrationCode({ token, verificationToken: pending.verificationToken, code });
      trackProductEvent({ kind: "staff_register_submit" });
      setPending(null);
      setSubmitted(true);
      showSuccessToast({ title: "スタッフ登録申請を受け付けました" });
    } catch (error) {
      // 入力し直すか再送すれば解決するエラーは、入力欄の下に出す。
      if (
        error instanceof StaffRegistrationApiError &&
        (error.code === "code_mismatch" || error.code === "code_unusable")
      ) {
        setCodeError(error.message);
        return;
      }
      showErrorToast(error);
    }
  });

  const { run: handleResend, isRunning: isResending } = useSingleFlight(async () => {
    if (!token || !pending) return;
    try {
      const sent = await resendStaffRegistrationCode({ token, verificationToken: pending.verificationToken });
      const now = Date.now();
      setPending({ ...pending, resendAvailableAt: now + sent.resendAfterMs, codeExpiresAt: now + sent.codeTtlMs });
      setCodeError(null);
      showSuccessToast({ title: "確認コードを再送しました" });
    } catch (error) {
      if (error instanceof StaffRegistrationApiError && error.code === "verification_unusable") {
        // serverに入力待ちが残っていないため、確認コードを送るところからやり直す。
        setPending(null);
        setCodeStepOpen(false);
      } else if (error instanceof StaffRegistrationApiError && error.resendAfterMs !== undefined) {
        setPending({ ...pending, resendAvailableAt: Date.now() + error.resendAfterMs });
      }
      showErrorToast(error);
    }
  });

  const handleReviseEmail = useCallback(() => {
    // 入力待ちは残す。同じ内容のまま進んだときに、届いている確認コードを使えるようにする。
    setCodeStepOpen(false);
    setCodeError(null);
  }, []);

  const handleCodeChange = useCallback(() => setCodeError(null), []);

  const codeStep: StaffRegistrationCodeStep | null =
    isCodeStepOpen && pending
      ? {
          email: pending.email,
          resendAvailableAt: pending.resendAvailableAt,
          codeError,
          isConfirming,
          isResending,
          onConfirmCode: async (code) => {
            await handleConfirmCode(code);
          },
          onResend: async () => {
            await handleResend();
          },
          onReviseEmail: handleReviseEmail,
          onCodeChange: handleCodeChange,
        }
      : null;

  return {
    isSubmitted,
    isSubmitting,
    initialFormValues,
    codeStep,
    handleSubmit: async (formData: StaffRegistrationFormData) => {
      await handleSubmit(formData);
    },
    turnstile: {
      widgetKey: turnstileKey,
      siteKey: TURNSTILE_SITE_KEY,
      onError: handleVerificationError,
      onVerify: handleVerified,
    },
    verificationError,
  };
}
