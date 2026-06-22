import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { StaffRegistrationFormData } from "@/convex/staffRegistration/schemas";
import { StaffRegistrationPage, type StaffRegistrationPageData } from "@/src/components/features/StaffRegistration";
import { StaffLayout } from "@/src/components/templates/StaffLayout";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";
import { showErrorToast, toaster } from "@/src/components/ui/toaster";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";

type Props = {
  token: string | undefined;
};

const expiredRegistrationData: StaffRegistrationPageData = {
  status: "expired",
  documents: {
    terms: { title: "スタッフ向け利用規約", path: "/terms/staff" },
    privacy: { title: "スタッフ向けプライバシーポリシー", path: "/privacy/staff" },
  },
};

// 重複・申請済みはエラーではなく「想定内の案内」なので warning トーストで知らせる。
const DUPLICATE_REGISTRATION_MESSAGE = {
  already_registered: "このメールアドレスは登録済みです。シフト提出や確定シフトの案内をお待ちください。",
  already_applied: "このメールアドレスは申請済みです。承認までしばらくお待ちください。",
} as const;

export function StaffRegistrationRoutePage({ token }: Props) {
  const data = useQuery(api.staffRegistration.queries.getRegistrationPageData, token ? { token } : "skip");
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
          toaster.create({ title: "参加申請を送りました", type: "success" });
        } else {
          toaster.create({
            title: DUPLICATE_REGISTRATION_MESSAGE[result.status],
            type: "warning",
            duration: Number.POSITIVE_INFINITY,
          });
        }
      } catch (error) {
        showErrorToast(error);
      }
    },
  );

  if (!token) {
    return (
      <StaffLayout shopName="スタッフ登録">
        <StaffRegistrationPage data={expiredRegistrationData} onSubmit={() => {}} />
      </StaffLayout>
    );
  }

  if (data === undefined) return <FullPageSpinner />;

  const pageData = data as StaffRegistrationPageData;
  const shopName = pageData.status === "ok" ? pageData.shopName : "スタッフ登録";

  return (
    <StaffLayout shopName={shopName}>
      <StaffRegistrationPage
        data={pageData}
        isSubmitting={isSubmitting}
        isSubmitted={isSubmitted}
        onSubmit={handleSubmit}
      />
    </StaffLayout>
  );
}
