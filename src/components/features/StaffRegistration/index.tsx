import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { StaffRegistrationFormData } from "@/convex/staffRegistration/schemas";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { toaster } from "@/src/components/ui/toaster";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { StaffRegistrationFlow } from "./StaffRegistrationFlow";
import type { StaffRegistrationPageData } from "./types";

type Props = {
  token: string | undefined;
  data: StaffRegistrationPageData;
};

// 重複・申請済みはエラーではなく「想定内の案内」なので warning トーストで知らせる。
const DUPLICATE_REGISTRATION_MESSAGE = {
  already_registered: "このメールアドレスは登録済みです。シフト提出や確定シフトの案内をお待ちください。",
  already_applied: "このメールアドレスは申請済みです。承認までしばらくお待ちください。",
} as const;

export function StaffRegistration({ token, data }: Props) {
  const submit = useMutation(api.staffRegistration.mutations.submitRegistrationRequest);
  const [isSubmitted, setSubmitted] = useState(false);
  const { run: handleSubmit, isRunning: isSubmitting } = useSingleFlight(
    async (formData: StaffRegistrationFormData) => {
      if (!token) return;

      try {
        const result = await submit({
          token,
          name: formData.name,
          email: formData.email,
          acceptedLegal: formData.acceptedLegal,
        });
        if (result.status === "ok") {
          setSubmitted(true);
          showSuccessToast({ title: "スタッフ登録申請を送りました" });
          return;
        }

        toaster.create({
          title: DUPLICATE_REGISTRATION_MESSAGE[result.status],
          type: "warning",
          duration: Number.POSITIVE_INFINITY,
        });
      } catch (error) {
        showErrorToast(error);
      }
    },
  );

  return (
    <StaffRegistrationFlow data={data} isSubmitting={isSubmitting} isSubmitted={isSubmitted} onSubmit={handleSubmit} />
  );
}

export type { StaffRegistrationPageData } from "./types";
