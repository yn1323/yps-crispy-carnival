import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { type ContactFormData, contactFormSchema } from "@/convex/contact/schemas";
import { VERIFICATION_REQUIRED_MESSAGE } from "@/src/components/shared/TurnstileWidget";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { trackAppError, trackProductEvent } from "@/src/lib/webMeasurement";
import { createContactFormDefaultValues, getContactMessagePresentation } from "./script";
import type { ContactSubmitData } from "./submitContactRequest";

const SUBMISSION_ERROR_MESSAGE = "問い合わせを送信できませんでした。\n少し時間をおいて、もう一度お試しください。";

export type ContactVerification = { siteKey: string } | { token: string };

type UseContactFormControllerProps = {
  onSubmit: (data: ContactSubmitData) => Promise<void>;
  verification: ContactVerification;
};

export function useContactFormController({ onSubmit, verification }: UseContactFormControllerProps) {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("token" in verification ? verification.token : "");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: createContactFormDefaultValues(),
  });
  const acceptedPrivacy = watch("acceptedPrivacy");
  const contactType = watch("type");
  const messageLength = watch("message").length;
  const messagePresentation = getContactMessagePresentation(contactType);

  const handleVerified = useCallback((token: string) => {
    setTurnstileToken(token);
    setVerificationError(null);
  }, []);

  // 失敗の案内と再試行は確認欄が表示するため、ここでは使えなくなったtokenだけを捨てる。
  const handleVerificationError = useCallback(() => {
    setTurnstileToken("");
  }, []);

  const { run: submitOnce, isRunning } = useSingleFlight(async (values: ContactFormData) => {
    if (!turnstileToken) {
      // site key未設定なら確認欄が読み込めない旨を表示するため、待機案内を重ねない。
      if ("siteKey" in verification && verification.siteKey) {
        setVerificationError(VERIFICATION_REQUIRED_MESSAGE);
      }
      return;
    }

    setServerError(null);
    try {
      await onSubmit({ ...values, turnstileToken, requestId: crypto.randomUUID() });
      trackProductEvent({ kind: "generate_lead" });
      setSubmitted(true);
    } catch (error) {
      trackAppError("section", error);
      setServerError(error instanceof Error ? error.message : SUBMISSION_ERROR_MESSAGE);
      if ("siteKey" in verification) {
        setTurnstileToken("");
        setTurnstileKey((current) => current + 1);
      }
    }
  });

  if (submitted) return { status: "submitted" as const };

  return {
    status: "editing" as const,
    acceptedPrivacy,
    errors: {
      type: errors.type?.message,
      name: errors.name?.message,
      email: errors.email?.message,
      organization: errors.organization?.message,
      message: errors.message?.message,
      acceptedPrivacy: errors.acceptedPrivacy?.message,
    },
    fields: {
      type: register("type"),
      name: register("name"),
      email: register("email"),
      organization: register("organization"),
      message: register("message"),
    },
    isSubmitting: isRunning,
    messageLength,
    messagePlaceholder: messagePresentation.placeholder,
    onAcceptedPrivacyChange: (accepted: boolean) =>
      setValue("acceptedPrivacy", accepted, { shouldDirty: true, shouldValidate: true }),
    onSubmit: handleSubmit((values) => void submitOnce(values)),
    serverError,
    showTroubleGuidance: messagePresentation.showTroubleGuidance,
    turnstile:
      "siteKey" in verification
        ? {
            widgetKey: turnstileKey,
            onError: handleVerificationError,
            onVerify: handleVerified,
            siteKey: verification.siteKey,
          }
        : null,
    verificationError,
  };
}
